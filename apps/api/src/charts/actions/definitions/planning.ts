import { addDays, formatWhen, skipSunday } from '../dates.js';
import { area, date, select, text, time } from '../fields.js';
import type { ActionContext, ActionDefinition } from '../types.js';

const note = (values: Record<string, string>, key: string) =>
  values[key] ? ` Note: ${values[key]}` : '';

const LINACS = ['LINAC 1', 'LINAC 2'] as const;
const DEFAULT_SLOT_TIME = '09:00';

/** Physicist: the plan is built and ready for the consultant. */
export const SUBMIT_PLAN: ActionDefinition = {
  label: 'Submit plan for approval',
  stamp: 'planSubmittedOn',
  fields: () => [
    text('planId', 'Plan ID', {
      required: true,
      maxLength: 30,
      placeholder: 'For example PLAN-5871',
      help: 'The plan ID in the planning system. Never a patient name.',
    }),
    area('planNote', 'Note for the consultant'),
  ],
  columns: (v) => ({ plan_id: v.planId! }),
  summary: (v) => `Plan ${v.planId} submitted for approval.${note(v, 'planNote')}`,
};

/** Consultant: the plan is approved. */
export const APPROVE_PLAN: ActionDefinition = {
  label: 'Approve plan',
  stamp: 'planApprovedOn',
  fields: () => [
    select('approvedBy', 'Approved by', {
      required: true,
      options: ['Consultant', 'Treating doctor'].map((value) => ({ value, label: value })),
      default: 'Consultant',
    }),
    area('planApprovalNote', 'Comment'),
  ],
  summary: (v) =>
    `Plan approved by the ${v.approvedBy!.toLowerCase()}.${note(v, 'planApprovalNote')}`,
};

/** Consultant: the plan goes back to the physicist, with a reason. The plan ID and submission are taken back. */
export const RETURN_PLAN: ActionDefinition = {
  label: 'Send back to physicist',
  clear: ['planSubmittedOn', 'planId'],
  fields: () => [],
  columns: () => ({ plan_id: null }),
  summary: (v) => `Send back to physicist. Reason: ${v.reason}`,
};

/** Treatment slots already taken on a machine: charts whose first treatment has not started yet. */
async function slotTaken(
  { tx, chart }: ActionContext,
  machine: string,
  day: string,
  at: string,
): Promise<string | null> {
  const found = await tx.query<{ display_number: string }>(
    `SELECT display_number FROM rt_charts
      WHERE id <> $1 AND status = 'OPEN'
        AND data->>'linacMachine' = $2 AND data->>'firstSlotDate' = $3 AND data->>'firstSlotTime' = $4
        AND NOT (data ? 'startOn')
      ORDER BY display_number LIMIT 1`,
    [chart.id, machine, day, at],
  );
  return found.rows[0]?.display_number ?? null;
}

/** The first day from the day after tomorrow (no Sundays) when LINAC 1 is free at 09:00. */
async function firstFreeDay(context: ActionContext): Promise<string> {
  let day = skipSunday(addDays(context.today, 2));
  for (let tries = 0; tries < 60; tries++) {
    if ((await slotTaken(context, LINACS[0], day, DEFAULT_SLOT_TIME)) === null) return day;
    day = skipSunday(addDays(day, 1));
  }
  return day;
}

/** Physicist: the approved plan is on the machine, and its first treatment slot is reserved. */
export const SEND_PLAN_TO_LINAC: ActionDefinition = {
  label: 'Send plan to LINAC',
  stamp: 'linacSentOn',
  fields: async (context) => [
    select('linacMachine', 'Machine', {
      required: true,
      options: LINACS.map((value) => ({ value, label: value })),
      default: LINACS[0],
    }),
    date('firstSlotDate', 'First treatment date', {
      required: true,
      min: context.today,
      minMessage: 'Choose today or a later date.',
      default: await firstFreeDay(context),
    }),
    time('firstSlotTime', 'First treatment time', { required: true, default: DEFAULT_SLOT_TIME }),
    area('linacNote', 'Note'),
  ],
  validate: async (values, context) => {
    // One machine, one patient at a time. Two people sending plans at once are made to queue here.
    await context.tx.query(`SELECT pg_advisory_xact_lock(hashtext('linac-first-slot'))`);
    const clash = await slotTaken(
      context,
      values.linacMachine!,
      values.firstSlotDate!,
      values.firstSlotTime!,
    );
    return clash
      ? [
          {
            field: 'firstSlotTime',
            message: `${values.linacMachine} is already booked at that time for ${clash}.`,
          },
        ]
      : [];
  },
  summary: (v) =>
    `Plan sent to ${v.linacMachine}. First treatment ${formatWhen(v.firstSlotDate!, v.firstSlotTime!)}.${note(v, 'linacNote')}`,
};
