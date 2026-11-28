import { addDays, formatDate, skipSunday } from '../dates.js';
import { area, date, text } from '../fields.js';
import { staff } from '../fields.js';
import type { ActionDefinition, ActionContext } from '../types.js';

const note = (values: Record<string, string>, key: string) =>
  values[key] ? ` Note: ${values[key]}` : '';

/** Facts a returned contouring takes back, so the work has to be done and checked again. */
const CONTOURING_FACTS = ['contourSubmittedOn', 'contourRef', 'seniorVerifiedOn'] as const;

/** Consultant, stage "CT Sim done": choose the junior resident who will contour, and when it is due. */
export const ASSIGN_CONTOURING: ActionDefinition = {
  label: 'Assign a junior resident',
  stamp: 'contourAssignedOn',
  fields: ({ today }) => [
    staff('resident', 'Junior resident', {
      required: true,
      requiredMessage: 'Choose a junior resident.',
      staffRole: 'JUNIOR_RESIDENT',
    }),
    date('contourDue', 'Contouring due by', {
      required: true,
      min: today,
      minMessage: 'Choose today or a later date.',
      default: skipSunday(addDays(today, 3)),
    }),
    area('contourInstructions', 'Instructions for the resident'),
  ],
  derive: async (values, { tx }: ActionContext) => {
    const found = await tx.query<{ full_name: string }>(
      'SELECT full_name FROM staff_users WHERE id = $1',
      [values.resident],
    );
    return { contourAssignee: found.rows[0]?.full_name ?? '' };
  },
  afterApply: async (values, { tx, chart, actor }) => {
    // Assigning again replaces the current assignee: the earlier one stays on record as ended.
    await tx.query(
      `UPDATE assignments SET ended_at = now()
        WHERE chart_id = $1 AND task_code = 'CONTOURING' AND ended_at IS NULL`,
      [chart.id],
    );
    await tx.query(
      `INSERT INTO assignments(chart_id, task_code, staff_id, assigned_by)
       VALUES ($1, 'CONTOURING', $2, $3)`,
      [chart.id, values.resident, actor.id],
    );
  },
  summary: (v) =>
    `Assigned to ${v.contourAssignee}. Contouring due ${formatDate(v.contourDue!)}.${note(v, 'contourInstructions')}`,
};

/** The assigned junior resident: the contouring is done and ready to be checked. */
export const SUBMIT_CONTOURING: ActionDefinition = {
  label: 'Submit contouring',
  stamp: 'contourSubmittedOn',
  fields: () => [
    text('contourRef', 'Contour set name', {
      maxLength: 40,
      help: 'Its name in the planning system, so the senior resident can find it.',
    }),
    area('contourNote', 'Note for the senior resident'),
  ],
  columns: (v) => (v.contourRef ? { contour_set_name: v.contourRef } : {}),
  summary: (v) =>
    `Contouring submitted${v.contourRef ? ` as ${v.contourRef}` : ''}.${note(v, 'contourNote')}`,
};

/** Senior resident: the contouring is correct. */
export const VERIFY_CONTOURING: ActionDefinition = {
  label: 'Verify contouring',
  stamp: 'seniorVerifiedOn',
  fields: () => [area('seniorNote', 'Comment')],
  summary: (v) => `Contouring verified.${note(v, 'seniorNote')}`,
};

/** Consultant: the contouring is approved and planning can begin. */
export const APPROVE_CONTOURING: ActionDefinition = {
  label: 'Approve contouring',
  stamp: 'contourApprovedOn',
  fields: () => [area('consultantNote', 'Comment')],
  summary: (v) => `Contouring approved.${note(v, 'consultantNote')}`,
};

/**
 * Senior resident or consultant: the contouring goes back to the junior resident, with a reason. What was
 * submitted, named and verified is taken back, so it has to be done and checked again.
 */
export const RETURN_CONTOURING: ActionDefinition = {
  label: 'Send back to junior resident',
  clear: CONTOURING_FACTS,
  fields: () => [],
  columns: () => ({ contour_set_name: null }),
  summary: (v) => `Send back to junior resident. Reason: ${v.reason}`,
};
