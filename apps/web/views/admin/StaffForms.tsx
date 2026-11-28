'use client';

import { useActionState, useState } from 'react';

import { CLINICAL_ROLES, STAFF_CAPABILITIES, type StaffMember } from '@oncotrack/contracts';

import { CAPABILITY_LABELS, ROLE_LABELS } from '@/utils/labels';

import { createStaff, deleteStaff, setStaffPassword, type StaffFormState, updateStaff } from '@/app/staff/actions';

const INPUT = 'min-h-11 rounded-[10px] border border-line bg-surface px-3 py-2 text-base aria-invalid:border-red-600';
const BUTTON =
  'self-start min-h-11 rounded-[10px] bg-brand px-5 py-2 text-brand-ink disabled:opacity-60 hover:opacity-90';

const first = (errors: Record<string, string[]> | undefined, field: string) => errors?.[field]?.[0];

function Checks({
  legend,
  name,
  options,
  chosen,
  error,
}: {
  legend: string;
  name: string;
  options: readonly { value: string; label: string }[];
  chosen: readonly string[];
  error?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {options.map(option => (
          <label key={option.value} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={name} value={option.value} defaultChecked={chosen.includes(option.value)} />
            {option.label}
          </label>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </fieldset>
  );
}

const ROLE_OPTIONS = CLINICAL_ROLES.map(value => ({ value, label: ROLE_LABELS[value] }));
const CAPABILITY_OPTIONS = STAFF_CAPABILITIES.map(value => ({ value, label: CAPABILITY_LABELS[value] }));

function Messages({ state }: { state: StaffFormState }) {
  return (
    <>
      {state.message && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
      {state.done && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {state.done}
        </p>
      )}
    </>
  );
}

/** Add an account. The form clears itself once the account is saved. */
export function CreateStaffForm({ directoryEnabled }: { directoryEnabled: boolean }) {
  const [state, formAction, pending] = useActionState<StaffFormState, FormData>(createStaff, {});
  const [provider, setProvider] = useState(state.values?.identityProvider === 'DIRECTORY' ? 'DIRECTORY' : 'LOCAL');
  const errors = state.fieldErrors;
  const values = state.values ?? {};
  // A saved account clears the form: the fields are remounted with nothing in them.
  const fresh = state.done ? 'saved' : 'editing';

  return (
    <form
      key={fresh}
      action={formAction}
      aria-labelledby="create-staff-title"
      className="flex max-w-lg flex-col gap-3"
      noValidate
    >
      <h2 id="create-staff-title" className="text-lg font-semibold">
        Add an account
      </h2>

      <div className="flex flex-col gap-1">
        <label htmlFor="new-fullName" className="text-sm font-medium">
          Full name
        </label>
        <input
          id="new-fullName"
          name="fullName"
          maxLength={120}
          defaultValue={String(values.fullName ?? '')}
          aria-invalid={first(errors, 'fullName') ? true : undefined}
          className={INPUT}
        />
        {first(errors, 'fullName') && <p className="text-sm text-red-600">{first(errors, 'fullName')}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="new-username" className="text-sm font-medium">
          Username
        </label>
        <input
          id="new-username"
          name="username"
          autoComplete="off"
          autoCapitalize="none"
          maxLength={50}
          defaultValue={String(values.username ?? '')}
          aria-invalid={first(errors, 'username') ? true : undefined}
          className={INPUT}
        />
        {first(errors, 'username') && <p className="text-sm text-red-600">{first(errors, 'username')}</p>}
      </div>

      {directoryEnabled && (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-medium">How they sign in</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="identityProvider"
              value="LOCAL"
              checked={provider === 'LOCAL'}
              onChange={() => setProvider('LOCAL')}
            />
            A password set here
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="identityProvider"
              value="DIRECTORY"
              checked={provider === 'DIRECTORY'}
              onChange={() => setProvider('DIRECTORY')}
            />
            The hospital directory (they use their directory password)
          </label>
          {first(errors, 'identityProvider') && (
            <p className="text-sm text-red-600">{first(errors, 'identityProvider')}</p>
          )}
        </fieldset>
      )}

      {provider === 'LOCAL' && (
        <div className="flex flex-col gap-1">
          <label htmlFor="new-password" className="text-sm font-medium">
            First password
          </label>
          <p className="text-sm text-muted">At least 12 characters. Tell the person in person, not in a message.</p>
          <input
            id="new-password"
            name="password"
            type="password"
            autoComplete="new-password"
            maxLength={128}
            aria-invalid={first(errors, 'password') ? true : undefined}
            className={INPUT}
          />
          {first(errors, 'password') && <p className="text-sm text-red-600">{first(errors, 'password')}</p>}
        </div>
      )}

      <Checks
        legend="Roles"
        name="roles"
        options={ROLE_OPTIONS}
        chosen={(values.roles as string[] | undefined) ?? []}
        error={first(errors, 'roles')}
      />
      <Checks
        legend="Extra access"
        name="capabilities"
        options={CAPABILITY_OPTIONS}
        chosen={(values.capabilities as string[] | undefined) ?? []}
        error={first(errors, 'capabilities')}
      />

      <Messages state={state} />
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? 'Adding…' : 'Add account'}
      </button>
    </form>
  );
}

/** Change one account. The id is the person's, so each form is its own. */
export function EditStaffForm({ member, isYou }: { member: StaffMember; isYou: boolean }) {
  const [state, formAction, pending] = useActionState<StaffFormState, FormData>(updateStaff, {});
  const errors = state.fieldErrors;
  const prefix = `edit-${member.id}`;

  return (
    <form
      action={formAction}
      aria-label={`Edit ${member.fullName}`}
      className="flex max-w-lg flex-col gap-3"
      noValidate
    >
      <input type="hidden" name="id" value={member.id} />

      <div className="flex flex-col gap-1">
        <label htmlFor={`${prefix}-name`} className="text-sm font-medium">
          Full name
        </label>
        <input
          id={`${prefix}-name`}
          name="fullName"
          maxLength={120}
          defaultValue={member.fullName}
          aria-invalid={first(errors, 'fullName') ? true : undefined}
          className={INPUT}
        />
        {first(errors, 'fullName') && <p className="text-sm text-red-600">{first(errors, 'fullName')}</p>}
      </div>

      <Checks legend="Roles" name="roles" options={ROLE_OPTIONS} chosen={member.roles} error={first(errors, 'roles')} />
      <Checks
        legend="Extra access"
        name="capabilities"
        options={CAPABILITY_OPTIONS}
        chosen={member.capabilities}
        error={first(errors, 'capabilities')}
      />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={member.isActive} disabled={isYou} />
        Can sign in
        {isYou && <span className="text-muted">(you cannot switch off your own account)</span>}
      </label>
      {/* A disabled box is not sent, so an unchangeable "on" is sent as a hidden value. */}
      {isYou && <input type="hidden" name="isActive" value="on" />}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isAvailable" defaultChecked={member.isAvailable} />
        Available for new work (untick while on leave)
      </label>

      <Messages state={state} />
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}

/** Set a new password for one account. */
export function PasswordForm({ member }: { member: StaffMember }) {
  const [state, formAction, pending] = useActionState<StaffFormState, FormData>(setStaffPassword, {});
  const id = `password-${member.id}`;
  const error = first(state.fieldErrors, 'password');
  const fresh = state.done ? 'saved' : 'editing';

  return (
    <form
      key={fresh}
      action={formAction}
      aria-label={`New password for ${member.fullName}`}
      className="flex max-w-lg flex-col gap-3"
      noValidate
    >
      <input type="hidden" name="id" value={member.id} />
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium">
          New password
        </label>
        <p className="text-sm text-muted">
          At least 12 characters. They are signed out everywhere and any lock on their account is cleared.
        </p>
        <input
          id={id}
          name="password"
          type="password"
          autoComplete="new-password"
          maxLength={128}
          aria-invalid={error ? true : undefined}
          className={INPUT}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      <Messages state={state} />
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? 'Setting…' : 'Set password'}
      </button>
    </form>
  );
}

/** Delete an account that was never used. It asks first, and only appears for an account with no history. */
export function DeleteStaffForm({ member }: { member: StaffMember }) {
  const [state, formAction, pending] = useActionState<StaffFormState, FormData>(deleteStaff, {});

  return (
    <form
      action={formAction}
      aria-label={`Delete ${member.fullName}`}
      className="flex max-w-lg flex-col gap-3 rounded-md border border-red-300 p-3 dark:border-red-900"
    >
      <input type="hidden" name="id" value={member.id} />
      <p className="text-sm">
        Nothing has ever been recorded against this account, so it can be deleted. This cannot be undone. An account
        that has been used can only be switched off, so the history keeps its name.
      </p>
      <Messages state={state} />
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md border border-red-700 px-4 py-2 text-red-700 disabled:opacity-60 dark:border-red-400 dark:text-red-400"
      >
        {pending ? 'Deleting…' : 'Delete this account'}
      </button>
    </form>
  );
}
