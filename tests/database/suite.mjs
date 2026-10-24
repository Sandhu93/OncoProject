import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { migrate } from '../../scripts/database.mjs';

export function registerSchemaTests(name, createDatabase) {
  describe(name, { concurrency: false }, () => {
    let pool;
    before(async () => {
      pool = await createDatabase();
      await migrate(pool);
    });
    after(async () => {
      await pool?.end();
    });

    async function fixture(run) {
      const client = await pool.connect();
      const staff = randomUUID();
      const patient = randomUUID();
      const workflow = randomUUID();
      const chart = randomUUID();
      const unit = randomUUID();
      try {
        await client.query('BEGIN');
        await client.query(
          "INSERT INTO staff_users(id, username, full_name, identity_provider, external_subject) VALUES ($1::uuid, $1::text, 'Synthetic test staff', 'DIRECTORY', $1::text)",
          [staff],
        );
        await client.query(
          "INSERT INTO patients(id, full_name, created_by) VALUES ($1, 'Synthetic patient', $2)",
          [patient, staff],
        );
        await client.query(
          "INSERT INTO workflow_versions(id, code, version, label) VALUES ($1::uuid, $1::text, 1, 'Synthetic test workflow')",
          [workflow],
        );
        await client.query(
          "INSERT INTO workflow_stages(workflow_id, code, label, display_order, is_initial) VALUES ($1, 'START', 'Start', 0, true), ($1, 'REVIEW', 'Review', 1, false)",
          [workflow],
        );
        await client.query(
          "UPDATE workflow_versions SET status = 'ACTIVE', approved_by = $2, approved_at = now() WHERE id = $1",
          [workflow, staff],
        );
        await client.query(
          "INSERT INTO rt_charts(id, patient_id, display_number, workflow_id, current_stage, consultant_id, created_by) VALUES ($1::uuid,$2,$1::text,$3,'START',$4,$4)",
          [chart, patient, workflow, staff],
        );
        const resource = randomUUID();
        await client.query(
          "INSERT INTO resources(id, name, kind) VALUES ($1::uuid, $1::text, 'LINAC')",
          [resource],
        );
        await client.query(
          "INSERT INTO resource_units(id, resource_id, label) VALUES ($1,$2,'Unit 1')",
          [unit, resource],
        );
        await run(client, { staff, patient, workflow, chart, unit });
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    }

    // A failed statement aborts a PostgreSQL transaction; a savepoint lets one test check several refusals.
    async function refuses(client, sql, params, expected) {
      await client.query('SAVEPOINT expect_refusal');
      await assert.rejects(client.query(sql, params), expected);
      await client.query('ROLLBACK TO SAVEPOINT expect_refusal');
    }

    async function addDraftWorkflow(client, stagesSql) {
      const workflow = randomUUID();
      await client.query(
        "INSERT INTO workflow_versions(id, code, version, label) VALUES ($1::uuid, $1::text, 1, 'Synthetic test workflow')",
        [workflow],
      );
      await client.query(stagesSql, [workflow]);
      return workflow;
    }

    it('DB-001 applies every migration idempotently with checksums', async () => {
      await migrate(pool);
      const files = (await readdir(new URL('../../database/migrations/', import.meta.url)))
        .filter((name) => /^\d+_.+\.sql$/.test(name))
        .sort();
      const result = await pool.query('SELECT name, checksum FROM schema_migrations ORDER BY name');
      assert.deepEqual(
        result.rows.map((row) => row.name),
        files,
      );
      for (const row of result.rows) assert.match(row.checksum, /^[a-f0-9]{64}$/);
    });
    it('DB-002 keeps development seed draft and rejects chart creation against it', async () => {
      await fixture(async (client, { patient, staff }) => {
        const seed = await readFile(
          new URL('../../database/seeds/development.sql', import.meta.url),
          'utf8',
        );
        await client.query(seed);
        await client.query(seed);
        await assert.rejects(
          client.query(
            "INSERT INTO rt_charts(patient_id, display_number, workflow_id, current_stage, consultant_id, created_by) VALUES ($1,$3,'00000000-0000-4000-8000-000000000001','REGISTERED',$2,$2)",
            [patient, staff, randomUUID()],
          ),
          { code: '55000' },
        );
      });
    });
    it('DB-003 refuses duplicate display RT numbers', async () => {
      await fixture(async (client, { patient, staff, workflow, chart }) => {
        await assert.rejects(
          client.query(
            "INSERT INTO rt_charts(patient_id, display_number, workflow_id, current_stage, consultant_id, created_by) VALUES ($1,$2,$3,'START',$4,$4)",
            [patient, chart, workflow, staff],
          ),
          { code: '23505' },
        );
      });
    });
    it('DB-004 prevents overlapping active appointments', async () => {
      await fixture(async (client, { chart, unit, staff }) => {
        const sql =
          'INSERT INTO appointments(chart_id, resource_unit_id, starts_at, ends_at, booked_by) VALUES ($1,$2,$3,$4,$5)';
        await client.query(sql, [chart, unit, '2030-01-01T09:00Z', '2030-01-01T10:00Z', staff]);
        await assert.rejects(
          client.query(sql, [chart, unit, '2030-01-01T09:30Z', '2030-01-01T10:30Z', staff]),
          { code: '23P01' },
        );
      });
    });
    it('DB-005 allows adjacent bookings and releases cancelled capacity', async () => {
      await fixture(async (client, { chart, unit, staff }) => {
        const sql =
          'INSERT INTO appointments(chart_id, resource_unit_id, starts_at, ends_at, booked_by) VALUES ($1,$2,$3,$4,$5) RETURNING id';
        const first = await client.query(sql, [
          chart,
          unit,
          '2030-01-01T09:00Z',
          '2030-01-01T10:00Z',
          staff,
        ]);
        await client.query(sql, [chart, unit, '2030-01-01T10:00Z', '2030-01-01T11:00Z', staff]);
        await client.query("UPDATE appointments SET status='CANCELLED' WHERE id=$1", [
          first.rows[0].id,
        ]);
        await client.query(sql, [chart, unit, '2030-01-01T09:00Z', '2030-01-01T10:00Z', staff]);
      });
    });
    for (const mutation of [
      "UPDATE audit_events SET action='CHANGED'",
      'DELETE FROM audit_events',
      'TRUNCATE audit_events',
    ]) {
      it(`DB-006 audit immutability: ${mutation}`, async () => {
        await fixture(async (client, { chart, staff }) => {
          await client.query(
            "INSERT INTO audit_events(chart_id, actor_id, action, entity_type, entity_id, request_id) VALUES ($1::uuid,$2,'CREATED','RT_CHART',$1::text,$3)",
            [chart, staff, randomUUID()],
          );
          await assert.rejects(client.query(mutation), { code: '55000' });
        });
      });
    }
    it('DB-007 freezes published stage definitions', async () => {
      await fixture(async (client, { workflow }) => {
        await assert.rejects(
          client.query("UPDATE workflow_stages SET label='Changed' WHERE workflow_id=$1", [
            workflow,
          ]),
          { code: '55000' },
        );
      });
    });
    it('DB-008 refuses a negative stall threshold', async () => {
      await fixture(async (client, { workflow, staff }) => {
        await assert.rejects(
          client.query(
            "INSERT INTO stage_thresholds(workflow_id,stage_code,threshold_minutes,updated_by) VALUES ($1,'START',-1,$2)",
            [workflow, staff],
          ),
          { code: '23514' },
        );
      });
    });
    it('DB-009 cannot attach an approval to a different chart', async () => {
      await fixture(async (client, { chart, patient, staff, workflow }) => {
        const otherChart = randomUUID();
        await client.query(
          "INSERT INTO rt_charts(id,patient_id,display_number,workflow_id,current_stage,consultant_id,created_by) VALUES ($1::uuid,$2,$1::text,$3,'START',$4,$4)",
          [otherChart, patient, workflow, staff],
        );
        const submission = await client.query(
          "INSERT INTO review_submissions(chart_id,kind,revision,submitted_by) VALUES ($1,'CONTOURING',1,$2) RETURNING id",
          [chart, staff],
        );
        await assert.rejects(
          client.query(
            "INSERT INTO review_decisions(chart_id,submission_id,review_step,decision,actor_id,actor_role) VALUES ($1,$2,'REVIEW','APPROVED',$3,'CONSULTANT')",
            [otherChart, submission.rows[0].id, staff],
          ),
          { code: '23503' },
        );
      });
    });

    it('DB-010 allocates sequential numbers per scope and gives back rolled-back numbers', async () => {
      const scopeA = `RT:${randomUUID()}`;
      const scopeB = `RT:${randomUUID()}`;
      await fixture(async (client) => {
        const next = async (scope) =>
          String((await client.query('SELECT allocate_number($1) AS n', [scope])).rows[0].n);
        assert.equal(await next(scopeA), '1');
        assert.equal(await next(scopeA), '2');
        assert.equal(await next(scopeB), '1');
        assert.equal(await next(scopeA), '3');
        await refuses(client, 'SELECT allocate_number($1)', [''], { code: '23514' });
      });
      const client = await pool.connect();
      try {
        for (const attempt of [1, 2]) {
          await client.query('BEGIN');
          const result = await client.query('SELECT allocate_number($1) AS n', [scopeA]);
          assert.equal(String(result.rows[0].n), '1', `attempt ${attempt} reuses the number`);
          await client.query('ROLLBACK');
        }
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });
    it('DB-011 locks a username after repeated failures and restarts after the window', async () => {
      await fixture(async (client) => {
        const fail = async (name) =>
          (
            await client.query(
              "SELECT record_failed_login($1, 3, '15 minutes'::interval, '30 minutes'::interval) AS locked_until",
              [name],
            )
          ).rows[0].locked_until;
        assert.equal(await fail('synthetic.user'), null);
        assert.equal(await fail('SYNTHETIC.USER'), null, 'names are normalized to lower case');
        assert.notEqual(await fail(' synthetic.user '), null, 'third failure locks the name');
        const row = await client.query(
          "SELECT failed_count FROM login_throttle WHERE username = 'synthetic.user'",
        );
        assert.equal(row.rows[0].failed_count, 3);

        await client.query(
          "UPDATE login_throttle SET window_started_at = now() - interval '1 hour', locked_until = NULL WHERE username = 'synthetic.user'",
        );
        assert.equal(await fail('synthetic.user'), null);
        const reset = await client.query(
          "SELECT failed_count FROM login_throttle WHERE username = 'synthetic.user'",
        );
        assert.equal(reset.rows[0].failed_count, 1);

        await refuses(client, "INSERT INTO login_throttle(username) VALUES ('Mixed.Case')", [], {
          code: '23514',
        });
      });
    });
    it('DB-012 allows only one active version of a workflow and releases it on retirement', async () => {
      await fixture(async (client, { staff, workflow }) => {
        const code = (
          await client.query('SELECT code FROM workflow_versions WHERE id = $1', [workflow])
        ).rows[0].code;
        const next = randomUUID();
        await client.query(
          "INSERT INTO workflow_versions(id, code, version, label) VALUES ($1, $2, 2, 'Synthetic version 2')",
          [next, code],
        );
        await client.query(
          "INSERT INTO workflow_stages(workflow_id, code, label, display_order, is_initial) VALUES ($1, 'START', 'Start', 0, true)",
          [next],
        );
        const activate =
          "UPDATE workflow_versions SET status = 'ACTIVE', approved_by = $2, approved_at = now() WHERE id = $1";
        await refuses(client, activate, [next, staff], { code: '23505' });
        await client.query("UPDATE workflow_versions SET status = 'RETIRED' WHERE id = $1", [
          workflow,
        ]);
        await client.query(activate, [next, staff]);
      });
    });
    it('DB-013 retires only ACTIVE workflows, keeps live charts running and blocks new ones', async () => {
      await fixture(async (client, { staff, patient, workflow, chart }) => {
        await refuses(
          client,
          "UPDATE workflow_versions SET label = 'Renamed' WHERE id = $1",
          [workflow],
          { code: '55000' },
        );
        await client.query("UPDATE workflow_versions SET status = 'RETIRED' WHERE id = $1", [
          workflow,
        ]);
        await refuses(
          client,
          "UPDATE workflow_versions SET status = 'ACTIVE' WHERE id = $1",
          [workflow],
          { code: '55000' },
        );
        await refuses(client, 'DELETE FROM workflow_versions WHERE id = $1', [workflow], {
          code: '55000',
        });
        await refuses(
          client,
          "INSERT INTO rt_charts(patient_id, display_number, workflow_id, current_stage, consultant_id, created_by) VALUES ($1, $2, $3, 'START', $4, $4)",
          [patient, randomUUID(), workflow, staff],
          { code: '55000' },
        );
        await client.query(
          "UPDATE rt_charts SET current_stage = 'REVIEW', current_stage_since = now(), version = version + 1 WHERE id = $1",
          [chart],
        );
      });
    });
    it('DB-014 enforces treatment update shape and one update per role per Saturday', async () => {
      await fixture(async (client, { chart, staff }) => {
        const insert =
          'INSERT INTO treatment_status_updates(chart_id, kind, week_ending, author_id, author_role, note) VALUES ($1, $2, $3, $4, $5, $6)';
        const add = (kind, weekEnding, role, note = null) =>
          client.query(insert, [chart, kind, weekEnding, staff, role, note]);
        await add('WEEKLY', '2030-01-05', 'JUNIOR_RESIDENT');
        await add('WEEKLY', '2030-01-05', 'RADIOGRAPHER');
        await add('WEEKLY', '2030-01-12', 'JUNIOR_RESIDENT');
        await refuses(
          client,
          insert,
          [chart, 'WEEKLY', '2030-01-05', staff, 'RADIOGRAPHER', null],
          {
            code: '23505',
          },
        );
        await refuses(
          client,
          insert,
          [chart, 'WEEKLY', '2030-01-04', staff, 'JUNIOR_RESIDENT', null],
          {
            code: '23514',
          },
        );
        await refuses(client, insert, [chart, 'WEEKLY', null, staff, 'JUNIOR_RESIDENT', null], {
          code: '23514',
        });
        await refuses(
          client,
          insert,
          [chart, 'COMPLETION', '2030-01-05', staff, 'RADIOGRAPHER', null],
          {
            code: '23514',
          },
        );
        await refuses(
          client,
          insert,
          [chart, 'WEEKLY', '2030-01-19', staff, 'JUNIOR_RESIDENT', 'x'.repeat(1001)],
          { code: '23514' },
        );
        await add('TREATMENT_START', null, 'JUNIOR_RESIDENT');
        await refuses(
          client,
          insert,
          [chart, 'TREATMENT_START', null, staff, 'JUNIOR_RESIDENT', null],
          {
            code: '23505',
          },
        );
        await add('COMPLETION', null, 'RADIOGRAPHER');
        await refuses(client, insert, [chart, 'COMPLETION', null, staff, 'JUNIOR_RESIDENT', null], {
          code: '23505',
        });
      });
    });
    it('DB-015 validates which stages require weekly updates and from whom', async () => {
      await fixture(async (client) => {
        const stage = (flag, roles) =>
          `INSERT INTO workflow_stages(workflow_id, code, label, display_order, is_initial, requires_weekly_update, weekly_update_roles) VALUES ($1, 'S', 'S', 0, true, ${flag}, ${roles})`;
        const workflow = await addDraftWorkflow(client, stage(false, "'{}'"));
        await client.query('DELETE FROM workflow_stages WHERE workflow_id = $1', [workflow]);
        await refuses(client, stage(true, "'{}'"), [workflow], { code: '23514' });
        await refuses(client, stage(false, "ARRAY['RADIOGRAPHER']"), [workflow], { code: '23514' });
        await refuses(client, stage(true, "ARRAY['NOT_A_ROLE']"), [workflow], { code: '23514' });
        await client.query(stage(true, "ARRAY['JUNIOR_RESIDENT','RADIOGRAPHER']"), [workflow]);
      });
    });
    it('DB-016 lists missing Saturday updates using Asia/Kolkata calendar boundaries', async () => {
      await fixture(async (client, { staff, patient }) => {
        const workflow = await addDraftWorkflow(
          client,
          "INSERT INTO workflow_stages(workflow_id, code, label, display_order, is_initial, requires_weekly_update, weekly_update_roles) VALUES ($1, 'START', 'Start', 0, true, false, '{}'), ($1, 'TREATING', 'Treating', 1, false, true, ARRAY['JUNIOR_RESIDENT','RADIOGRAPHER'])",
        );
        await client.query(
          "UPDATE workflow_versions SET status = 'ACTIVE', approved_by = $2, approved_at = now() WHERE id = $1",
          [workflow, staff],
        );
        const open = async (since, status) => {
          const id = randomUUID();
          await client.query(
            "INSERT INTO rt_charts(id, patient_id, display_number, workflow_id, current_stage, consultant_id, created_by) VALUES ($1::uuid, $2, $1::text, $3, 'START', $4, $4)",
            [id, patient, workflow, staff],
          );
          await client.query(
            'UPDATE rt_charts SET current_stage = $2, current_stage_since = $3, status = $4 WHERE id = $1',
            [id, 'TREATING', since, status],
          );
          return id;
        };
        const started = await open('2030-01-02T05:00:00Z', 'OPEN');
        const startedAfterSaturday = await open('2030-01-05T18:30:00Z', 'OPEN'); // Sunday 00:00 IST
        const closed = await open('2030-01-02T05:00:00Z', 'CLOSED');
        const mine = [started, startedAfterSaturday, closed];
        const due = async (asOf) =>
          (
            await client.query(
              "SELECT due_chart_id AS chart, due_role AS role, to_char(due_week_ending, 'YYYY-MM-DD') AS week FROM weekly_updates_due($1::timestamptz) ORDER BY due_role, due_chart_id",
              [asOf],
            )
          ).rows.filter((row) => mine.includes(row.chart));

        // Saturday 10:00 IST: both roles owe the update for that day; late starters and closed charts do not.
        assert.deepEqual(await due('2030-01-05T04:30:00Z'), [
          { chart: started, role: 'JUNIOR_RESIDENT', week: '2030-01-05' },
          { chart: started, role: 'RADIOGRAPHER', week: '2030-01-05' },
        ]);
        await client.query(
          "INSERT INTO treatment_status_updates(chart_id, kind, week_ending, author_id, author_role) VALUES ($1, 'WEEKLY', '2030-01-05', $2, 'JUNIOR_RESIDENT')",
          [started, staff],
        );
        assert.deepEqual(await due('2030-01-09T10:00:00Z'), [
          { chart: started, role: 'RADIOGRAPHER', week: '2030-01-05' },
        ]);
        // Friday 23:59 IST still refers to the previous Saturday; Saturday 00:00 IST starts the next one.
        assert.equal((await due('2030-01-11T18:29:00Z'))[0].week, '2030-01-05');
        const nextSaturday = await due('2030-01-11T18:30:00Z');
        assert.deepEqual(
          nextSaturday.map((row) => [row.chart, row.role, row.week]),
          [
            [started, 'JUNIOR_RESIDENT', '2030-01-12'],
            [startedAfterSaturday, 'JUNIOR_RESIDENT', '2030-01-12'],
            [started, 'RADIOGRAPHER', '2030-01-12'],
            [startedAfterSaturday, 'RADIOGRAPHER', '2030-01-12'],
          ].sort((a, b) => (a[1] === b[1] ? (a[0] < b[0] ? -1 : 1) : a[1] < b[1] ? -1 : 1)),
        );
      });
    });
  });
}
