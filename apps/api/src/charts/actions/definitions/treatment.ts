import { DomainError } from '../../../transactions/domain-error.js';
import { formatDate, formatWhen } from '../dates.js';
import { area, date, heading, number, select, time } from '../fields.js';
import type { ActionCheck } from '@oncotrack/contracts';
import type { ActionContext, ActionDefinition } from '../types.js';

const note = (values: Record<string, string>, key: string) =>
  values[key] ? ` Note: ${values[key]}` : '';

const options = (...values: string[]) => values.map((value) => ({ value, label: value }));

/** What must be true before the patient is told to come: the three checks the prototype shows. */
function readiness({ chart }: ActionContext): ActionCheck[] {
  const { contourApprovedOn, planApprovedOn, firstSlotDate, firstSlotTime, linacMachine } =
    chart.data;
  return [
    {
      label: 'Contouring approved',
      ok: Boolean(contourApprovedOn),
      detail: contourApprovedOn ? formatDate(contourApprovedOn) : 'Not yet',
    },
    {
      label: 'Plan approved',
      ok: Boolean(planApprovedOn),
      detail: planApprovedOn ? formatDate(planApprovedOn) : 'Not yet',
    },
    {
      label: 'LINAC slot reserved',
      ok: Boolean(firstSlotDate),
      detail: firstSlotDate
        ? `${formatWhen(firstSlotDate, firstSlotTime ?? '')}${linacMachine ? `, ${linacMachine}` : ''}`
        : 'Not yet',
    },
  ];
}

/** Radiographer: tell the patient when to come. Refused unless everything is in place. */
export const INFORM_PATIENT: ActionDefinition = {
  label: 'Tell patient to come',
  stamp: 'informedOn',
  checks: readiness,
  assertReady: (context) => {
    const missing = readiness(context).filter((check) => !check.ok);
    if (missing.length > 0) {
      throw new DomainError(
        409,
        'PREREQUISITES_MISSING',
        `The patient cannot be told yet. Still missing: ${missing.map((check) => check.label.toLowerCase()).join(', ')}.`,
      );
    }
  },
  fields: ({ today, chart }) => {
    const slot = chart.data.firstSlotDate;
    return [
      select('informedHow', 'How was the patient told?', {
        required: true,
        options: options('Phone', 'In person', 'Through the ward', 'Other'),
        default: 'Phone',
      }),
      date('arriveDate', 'Patient should arrive on', {
        required: true,
        min: today,
        minMessage: 'Choose today or a later date.',
        default: slot && slot >= today ? slot : today,
      }),
      time('arriveTime', 'Arrival time', {
        required: true,
        default: chart.data.firstSlotTime,
      }),
      area('informNote', 'Note', { placeholder: 'For example: spoke to the attender.' }),
    ];
  },
  summary: (v) =>
    `Patient told by ${v.informedHow!.toLowerCase()} to arrive ${formatWhen(v.arriveDate!, v.arriveTime!)}.${note(v, 'informNote')}`,
};

/** Junior resident: the first treatment has been given. */
export const START_TREATMENT: ActionDefinition = {
  label: 'Record treatment start',
  fields: ({ today, chart }) => [
    date('startOn', 'Date treatment started', {
      required: true,
      min: chart.data.informedOn,
      minMessage: 'This date is before the patient was told.',
      max: today,
      maxMessage: 'This date is in the future.',
      default: today,
    }),
    area('startNote', 'Note'),
  ],
  derive: async () => ({ sessionsDone: '0' }),
  afterApply: async (values, { tx, chart, actor, role }) => {
    await tx.query(
      `INSERT INTO treatment_status_updates(chart_id, kind, author_id, author_role, note)
       VALUES ($1, 'TREATMENT_START', $2, $3, $4)`,
      [chart.id, actor.id, role, values.startNote ?? null],
    );
  },
  summary: (v) => `Treatment started on ${formatDate(v.startOn!)}.${note(v, 'startNote')}`,
};

const asked = (planned: number | null) => (planned === null ? '' : `${planned} were planned.`);

/** Junior resident: treatment is finished, on time or early. */
export const COMPLETE_TREATMENT: ActionDefinition = {
  label: 'Record treatment complete',
  fields: ({ today, chart }) => {
    const planned = chart.plannedSessions;
    return [
      date('completeOn', 'Date treatment finished', {
        required: true,
        min: chart.data.startOn,
        minMessage: 'This date is before treatment started.',
        max: today,
        maxMessage: 'This date is in the future.',
        default: today,
      }),
      number('sessionsFinal', 'Sessions given in total', {
        required: true,
        min: '0',
        ...(planned === null ? {} : { max: String(planned) }),
        minMessage: 'Enter a whole number, 0 or more.',
        maxMessage: `Enter a number from 0 to ${planned}.`,
        default: planned === null ? undefined : String(planned),
        help: asked(planned),
      }),
      area('completeNote', 'Note', {
        placeholder: 'Why did treatment end early?',
        help: 'Required if fewer sessions than planned were given.',
        requiredMessage: 'Say why treatment ended early.',
        requiredWhen: (values) =>
          planned !== null &&
          values.sessionsFinal !== undefined &&
          Number(values.sessionsFinal) < planned,
      }),
    ];
  },
  derive: async (values) => ({ sessionsDone: values.sessionsFinal! }),
  afterApply: async (values, { tx, chart, actor, role }) => {
    await tx.query(
      `INSERT INTO treatment_status_updates(chart_id, kind, author_id, author_role, note)
       VALUES ($1, 'COMPLETION', $2, $3, $4)`,
      [chart.id, actor.id, role, values.completeNote ?? null],
    );
  },
  summary: (v, { chart }) =>
    `Treatment finished on ${formatDate(v.completeOn!)} after ${v.sessionsFinal} of ${chart.plannedSessions ?? '?'} sessions.${note(v, 'completeNote')}`,
};

/**
 * Junior resident and radiographer, once each Saturday, while treatment is in progress. Not a stage change:
 * the chart stays where it is, and the update is kept on the chart and in the treatment updates.
 */
export const POST_WEEKLY_UPDATE: ActionDefinition = {
  label: 'Post Saturday update',
  assertReady: async ({ tx, chart, role, weekEnding }) => {
    const found = await tx.query(
      `SELECT 1 FROM treatment_status_updates
        WHERE chart_id = $1 AND kind = 'WEEKLY' AND week_ending = $2 AND author_role = $3`,
      [chart.id, weekEnding, role],
    );
    if (found.rows.length > 0) {
      throw new DomainError(
        409,
        'ALREADY_POSTED',
        'This role has already posted the update for this week. It cannot be edited.',
      );
    }
  },
  fields: ({ chart, weekEnding }) => {
    const done = Number(chart.data.sessionsDone ?? 0);
    const planned = chart.plannedSessions;
    return [
      heading(`Week ending ${formatDate(weekEnding)}`),
      number('sessionsTotal', 'Sessions given so far', {
        required: true,
        min: String(done),
        ...(planned === null ? {} : { max: String(planned) }),
        minMessage: `Enter ${done} or more: ${done} were recorded before this update.`,
        maxMessage: `Enter a number from ${done} to ${planned}.`,
        default: String(planned === null ? done + 5 : Math.min(planned, done + 5)),
        help: `${done}${planned === null ? '' : ` of ${planned}`} recorded before this update.`,
      }),
      select('gap', 'Any gap in treatment this week?', {
        required: true,
        options: options('No', 'Yes'),
        default: 'No',
      }),
      area('weeklyNote', 'Operational note', {
        placeholder: 'Operational notes only, no clinical findings.',
        help: 'Required if there was a gap. It cannot be edited after posting.',
        requiredMessage: 'Say what happened: a note is needed if there was a gap.',
        requiredWhen: (values) => values.gap === 'Yes',
      }),
    ];
  },
  derive: async (values) => ({ sessionsDone: values.sessionsTotal!, lastGap: values.gap! }),
  afterApply: async (values, { tx, chart, actor, role, weekEnding }) => {
    await tx.query(
      `INSERT INTO treatment_status_updates(chart_id, kind, week_ending, author_id, author_role, note)
       VALUES ($1, 'WEEKLY', $2, $3, $4, $5)`,
      [chart.id, weekEnding, actor.id, role, values.weeklyNote ?? null],
    );
  },
  summary: (v, { chart }) =>
    `Saturday update posted. ${v.sessionsTotal}${chart.plannedSessions === null ? '' : ` of ${chart.plannedSessions}`} sessions given.${v.gap === 'Yes' ? ' There was a gap in treatment this week.' : ''}${note(v, 'weeklyNote')}`,
};

/**
 * Junior resident and radiographer, once each, after treatment is complete. The second one ends tracking.
 * Like a Saturday update it is kept as it was posted and cannot be edited.
 */
export const POST_FINAL_UPDATE: ActionDefinition = {
  label: 'Post final update',
  assertReady: async ({ tx, chart, role }) => {
    const found = await tx.query(
      `SELECT 1 FROM treatment_status_updates WHERE chart_id = $1 AND kind = 'FINAL' AND author_role = $2`,
      [chart.id, role],
    );
    if (found.rows.length > 0) {
      throw new DomainError(
        409,
        'ALREADY_POSTED',
        'This role has already posted its final update. It cannot be edited.',
      );
    }
  },
  fields: () => [
    area('finalNote', 'Final note', {
      placeholder: 'Operational notes only, no clinical findings.',
      help: 'Optional. It cannot be edited after posting.',
    }),
  ],
  derive: async (_values, { role, today }) => ({
    [role === 'RADIOGRAPHER' ? 'finalRadiographerOn' : 'finalJuniorOn']: today,
  }),
  afterApply: async (values, { tx, chart, actor, role }) => {
    await tx.query(
      `INSERT INTO treatment_status_updates(chart_id, kind, author_id, author_role, note)
       VALUES ($1, 'FINAL', $2, $3, $4)`,
      [chart.id, actor.id, role, values.finalNote ?? null],
    );
  },
  summary: (v) => `Final update posted.${note(v, 'finalNote')}`,
};
