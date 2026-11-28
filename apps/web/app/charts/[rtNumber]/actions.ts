'use server';

import { redirect } from 'next/navigation';

import { randomUUID } from 'node:crypto';

import { ApiError } from '@/services/api/api-errors';
import ChartService from '@/services/api/chart.service';

import { chartHref } from '@/views/charts/ChartTable';

export interface ActionState {
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /** What was typed, so the form keeps it after an error. */
  values?: Record<string, string>;
}

/** The form's own bookkeeping fields; everything else is a value of the step. */
const CONTROL_FIELDS = new Set(['rtNumber', 'action', 'expectedVersion']);

/** The API's refusals, in words for the person at the screen. */
const REFUSALS: Record<string, string> = {
  CHART_CHANGED: 'This chart changed while you were working. Reload the page to see the latest, then try again.',
  CHART_CLOSED: 'This chart is closed, so no more steps can be recorded.',
  ROLE_NOT_ALLOWED: 'Your role cannot do this step.',
  NOT_ASSIGNED: 'Only the junior resident assigned to this chart can do this step.',
  ACTION_NOT_AVAILABLE: 'This step is no longer available. Reload the page to see what comes next.',
};

/**
 * Records one step of the workflow and shows the chart again. Errors are returned, not thrown: in
 * production Next.js hides the message of an error thrown in a server action.
 *
 * Each submission carries its own Idempotency-Key, so a request the API received twice still records once.
 */
export async function performAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const rtNumber = String(formData.get('rtNumber') ?? '');
  const action = String(formData.get('action') ?? '');
  const expectedVersion = Number(formData.get('expectedVersion'));
  const values: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string' && !CONTROL_FIELDS.has(key) && !key.startsWith('$')) values[key] = value;
  }

  if (!rtNumber || !action || !Number.isInteger(expectedVersion)) {
    return { values, message: 'This form is incomplete. Reload the page and try again.' };
  }

  try {
    await ChartService.perform(rtNumber, action, { expectedVersion, values }, randomUUID());
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) {
      return {
        values,
        message: (error.code && REFUSALS[error.code]) ?? error.message,
        fieldErrors: error.fieldErrors,
      };
    }

    console.error('Recording a step failed:', error);

    return { values, message: 'The step could not be recorded right now. Please try again in a moment.' };
  }

  // Outside the try: redirect() works by throwing.
  redirect(chartHref(rtNumber));
}
