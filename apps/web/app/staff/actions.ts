'use server';

import { revalidatePath } from 'next/cache';

import { CLINICAL_ROLES, type ClinicalRole, STAFF_CAPABILITIES, type StaffCapability } from '@oncotrack/contracts';
import { randomUUID } from 'node:crypto';

import AdminService from '@/services/api/admin.service';
import { ApiError } from '@/services/api/api-errors';

export interface StaffFormState {
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /** What was typed, so the form keeps it after an error. Never the password. */
  values?: Record<string, string | string[]>;
  /** Set after a save, so the form can say so and clear itself. */
  done?: string;
}

const readList = <T extends string>(formData: FormData, name: string, allowed: readonly T[]): T[] =>
  formData
    .getAll(name)
    .map(String)
    .filter((value): value is T => (allowed as readonly string[]).includes(value));

const fail = (error: unknown, what: string, values?: StaffFormState['values']): StaffFormState => {
  if (error instanceof ApiError && error.status < 500) {
    return { values, message: error.message, fieldErrors: error.fieldErrors };
  }

  console.error(`${what} failed:`, error);

  return { values, message: `${what} did not work right now. Please try again in a moment.` };
};

/** Adds a staff account. */
export async function createStaff(_previous: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const roles = readList<ClinicalRole>(formData, 'roles', CLINICAL_ROLES);
  const capabilities = readList<StaffCapability>(formData, 'capabilities', STAFF_CAPABILITIES);
  const username = String(formData.get('username') ?? '');
  const fullName = String(formData.get('fullName') ?? '');
  const password = String(formData.get('password') ?? '');
  const values = { username, fullName, roles, capabilities };

  try {
    await AdminService.createStaff({ username, fullName, roles, capabilities, password }, randomUUID());
  } catch (error) {
    return fail(error, 'Adding the account', values);
  }

  revalidatePath('/staff');

  return { done: `${fullName.trim()} can now sign in.` };
}

/** Changes a name, roles, access, or whether the account is switched on or available. */
export async function updateStaff(_previous: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const id = String(formData.get('id') ?? '');
  const fullName = String(formData.get('fullName') ?? '');
  const roles = readList<ClinicalRole>(formData, 'roles', CLINICAL_ROLES);
  const capabilities = readList<StaffCapability>(formData, 'capabilities', STAFF_CAPABILITIES);
  const isActive = formData.get('isActive') === 'on';
  const isAvailable = formData.get('isAvailable') === 'on';
  const values = { fullName, roles, capabilities, isActive: String(isActive), isAvailable: String(isAvailable) };

  if (!id) return { values, message: 'This form is incomplete. Reload the page and try again.' };

  try {
    await AdminService.updateStaff(id, { fullName, roles, capabilities, isActive, isAvailable }, randomUUID());
  } catch (error) {
    return fail(error, 'Saving the changes', values);
  }

  revalidatePath('/staff');

  return { done: 'Saved.' };
}

/** Sets a new password. The person is signed out everywhere and must use it next time. */
export async function setStaffPassword(_previous: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const id = String(formData.get('id') ?? '');
  const password = String(formData.get('password') ?? '');

  if (!id) return { message: 'This form is incomplete. Reload the page and try again.' };

  try {
    await AdminService.setPassword(id, password, randomUUID());
  } catch (error) {
    return fail(error, 'Setting the password');
  }

  revalidatePath('/staff');

  return { done: 'Password set. They have been signed out.' };
}
