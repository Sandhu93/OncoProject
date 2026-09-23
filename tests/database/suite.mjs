import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
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

    it('DB-001 applies the migration idempotently with checksums', async () => {
      await migrate(pool);
      const result = await pool.query('SELECT name, checksum FROM schema_migrations');
      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].name, '001_initial.sql');
      assert.match(result.rows[0].checksum, /^[a-f0-9]{64}$/);
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
    it('DB-010 refuses duplicate usernames', async () => {
  await fixture(async (client, { staff }) => {
    const duplicateStaff = randomUUID();
    await assert.rejects(
      client.query(
        "INSERT INTO staff_users(id, username, full_name, identity_provider, external_subject) VALUES ($1::uuid, $2::text, 'Another synthetic test staff', 'DIRECTORY', $1::text)",
        [duplicateStaff, staff],
      ),
      { code: '23505' },
    );
  });
});
it('DB-011 refuses a chart starting at a non-initial stage', async () => {
  await fixture(async (client, { patient, staff, workflow }) => {
    await assert.rejects(
      client.query(
        "INSERT INTO rt_charts(patient_id, display_number, workflow_id, current_stage, consultant_id, created_by) VALUES ($1,$2,$3,'REVIEW',$4,$4)",
        [patient, randomUUID(), workflow, staff],
      ),
      { code: '55000' },
    );
  });
});
  });
}
