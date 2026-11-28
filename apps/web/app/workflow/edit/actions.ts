'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { CLINICAL_ROLES, type ClinicalRole, type UpdateWorkflowDraftRequest } from '@oncotrack/contracts';
import { randomUUID } from 'node:crypto';

import AdminService from '@/services/api/admin.service';
import { ApiError } from '@/services/api/api-errors';

export interface WorkflowFormState {
  message?: string;
  /** Messages by the field the API named, for example `stages.3.label`. */
  fieldErrors?: Record<string, string[]>;
  done?: string;
}

const fail = (error: unknown, what: string): WorkflowFormState => {
  if (error instanceof ApiError && error.status < 500) {
    return { message: error.message, fieldErrors: error.fieldErrors };
  }

  console.error(`${what} failed:`, error);

  return { message: `${what} did not work right now. Please try again in a moment.` };
};

const roles = (formData: FormData, name: string): ClinicalRole[] =>
  formData
    .getAll(name)
    .map(String)
    .filter((value): value is ClinicalRole => (CLINICAL_ROLES as readonly string[]).includes(value));

/** Starts a draft as a copy of the workflow in use. */
export async function startDraft(): Promise<WorkflowFormState> {
  try {
    await AdminService.startWorkflowDraft(randomUUID());
  } catch (error) {
    return fail(error, 'Starting the draft');
  }

  revalidatePath('/workflow/edit');

  return { done: 'Draft started.' };
}

/**
 * Saves everything on the form. Every stage and step is sent, which is harmless: what has not changed stays as it was.
 * The form names its fields `label`, `stage:<code>`, `weekly:<code>` and `step:<from>|<action>`.
 */
export async function saveDraft(_previous: WorkflowFormState, formData: FormData): Promise<WorkflowFormState> {
  const payload: UpdateWorkflowDraftRequest = {
    label: String(formData.get('label') ?? ''),
    stages: [],
    steps: [],
  };
  const stages: { code: string; label?: string; weeklyUpdateRoles?: ClinicalRole[] }[] = [];
  const steps: { from: string; action: string; roles: ClinicalRole[] }[] = [];

  for (const key of new Set([...formData.keys()])) {
    if (key.startsWith('stage:')) {
      const code = key.slice('stage:'.length);
      const weeklyKey = `weekly:${code}`;

      stages.push({
        code,
        label: String(formData.get(key) ?? ''),
        ...(formData.has(`hasWeekly:${code}`) ? { weeklyUpdateRoles: roles(formData, weeklyKey) } : {}),
      });
    }

    if (key.startsWith('hasSteps:')) {
      const [from = '', action = ''] = key.slice('hasSteps:'.length).split('|');

      steps.push({ from, action, roles: roles(formData, `step:${from}|${action}`) });
    }
  }

  try {
    await AdminService.editWorkflowDraft({ ...payload, stages, steps }, randomUUID());
  } catch (error) {
    return fail(error, 'Saving the draft');
  }

  revalidatePath('/workflow/edit');

  return { done: 'Saved.' };
}

/** Makes the draft the workflow in use. */
export async function approveDraft(): Promise<WorkflowFormState> {
  try {
    await AdminService.approveWorkflowDraft(randomUUID());
  } catch (error) {
    return fail(error, 'Approving the draft');
  }

  revalidatePath('/workflow');
  revalidatePath('/workflow/edit');
  redirect('/workflow');
}

/** Throws the draft away. */
export async function discardDraft(): Promise<WorkflowFormState> {
  try {
    await AdminService.discardWorkflowDraft(randomUUID());
  } catch (error) {
    return fail(error, 'Discarding the draft');
  }

  revalidatePath('/workflow/edit');

  return { done: 'Draft discarded.' };
}
