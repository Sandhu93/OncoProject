'use server';

import { revalidatePath } from 'next/cache';

import { randomUUID } from 'node:crypto';

import { CLINICAL_ROLES, type ClinicalRole } from '@oncotrack/contracts';

import { ApiError } from '@/services/api/api-errors';
import ChartService from '@/services/api/chart.service';

import { chartHref } from '@/views/charts/ChartTable';

export interface CommentState {
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /** What was typed, so the form keeps it after an error. */
  values?: { body: string; forRole: string };
  /** Set after a comment is saved, so the form can clear itself and say so. */
  posted?: boolean;
}

/** Adds a comment to the chart's discussion. Errors are returned, not thrown, as for a step. */
export async function postComment(_previous: CommentState, formData: FormData): Promise<CommentState> {
  const rtNumber = String(formData.get('rtNumber') ?? '');
  const body = String(formData.get('body') ?? '');
  const forRole = String(formData.get('forRole') ?? '');
  const values = { body, forRole };

  if (!rtNumber) return { values, message: 'This form is incomplete. Reload the page and try again.' };

  const role = (CLINICAL_ROLES as readonly string[]).includes(forRole) ? (forRole as ClinicalRole) : null;

  try {
    await ChartService.comment(rtNumber, { body, forRole: role }, randomUUID());
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) {
      return { values, message: error.message, fieldErrors: error.fieldErrors };
    }

    console.error('Adding a comment failed:', error);

    return { values, message: 'The comment could not be saved right now. Please try again in a moment.' };
  }

  revalidatePath(chartHref(rtNumber));

  return { posted: true };
}
