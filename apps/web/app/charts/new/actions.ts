'use server';

import { redirect } from 'next/navigation';

import type { IssueChartRequest } from '@oncotrack/contracts';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { ApiError } from '@/services/api/api-errors';
import ChartService from '@/services/api/chart.service';

import { chartHref } from '@/views/charts/ChartTable';

export type IssueChartField =
  'rtNumber' | 'plannedSessions' | 'priority' | 'planId' | 'contourSetName' | 'scanReference';

export interface IssueChartState {
  message?: string;
  fieldErrors?: Partial<Record<IssueChartField, string[]>>;
  /** What was typed, so the form keeps it after an error. */
  values?: Partial<Record<IssueChartField, string>>;
}

const FIELDS: readonly IssueChartField[] = [
  'rtNumber',
  'plannedSessions',
  'priority',
  'planId',
  'contourSetName',
  'scanReference',
];

const REFERENCE_MAX = 60;

const reference = z.string().trim().max(REFERENCE_MAX, `Use at most ${REFERENCE_MAX} characters.`);

const IssueChartSchema = z.object({
  rtNumber: z.string().trim().min(1, 'Enter the RT number.').max(40, 'Use at most 40 characters.'),
  plannedSessions: z
    .string()
    .trim()
    .regex(/^\d{1,3}$/, 'Enter a whole number from 1 to 100.')
    .transform(Number)
    .pipe(
      z.number().int().min(1, 'Enter a whole number from 1 to 100.').max(100, 'Enter a whole number from 1 to 100.'),
    ),
  priority: z.enum(['ROUTINE', 'URGENT'], { message: 'Choose Routine or Urgent.' }),
  planId: reference,
  contourSetName: reference,
  scanReference: reference,
});

/** The words shown for the API's stable refusal codes. */
const REFUSALS: Record<string, string> = {
  WORKFLOW_NOT_ACTIVE:
    'No workflow is active yet, so charts cannot be issued. A consultant must confirm and activate the workflow first.',
  ROLE_NOT_ALLOWED: 'Only a consultant can issue a chart.',
};

const readValues = (formData: FormData): NonNullable<IssueChartState['values']> =>
  Object.fromEntries(FIELDS.map(field => [field, String(formData.get(field) ?? '')]));

/**
 * Issues a chart and opens it. Errors are returned, not thrown: in production Next.js hides the message
 * of an error thrown in a server action.
 *
 * Each submission carries its own Idempotency-Key, so a request the API received twice (a retried network
 * call) still creates one chart.
 */
export async function issueChart(_previous: IssueChartState, formData: FormData): Promise<IssueChartState> {
  const values = readValues(formData);
  const parsed = IssueChartSchema.safeParse(values);

  if (!parsed.success) {
    return { values, fieldErrors: z.flattenError(parsed.error).fieldErrors as IssueChartState['fieldErrors'] };
  }

  const { rtNumber, plannedSessions, priority, planId, contourSetName, scanReference } = parsed.data;
  const payload: IssueChartRequest = {
    rtNumber,
    plannedSessions,
    priority,
    ...(planId && { planId }),
    ...(contourSetName && { contourSetName }),
    ...(scanReference && { scanReference }),
  };

  let issuedNumber: string;

  try {
    issuedNumber = (await ChartService.issue(payload, randomUUID())).rtNumber;
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) {
      if (error.code === 'RT_NUMBER_EXISTS') {
        return { values, fieldErrors: { rtNumber: ['A chart with this RT number already exists.'] } };
      }

      return {
        values,
        message: (error.code && REFUSALS[error.code]) ?? error.message,
        fieldErrors: error.fieldErrors as IssueChartState['fieldErrors'],
      };
    }

    console.error('Issuing a chart failed:', error);

    return { values, message: 'The chart could not be issued right now. Please try again in a moment.' };
  }

  // Outside the try: redirect() works by throwing.
  redirect(chartHref(issuedNumber));
}
