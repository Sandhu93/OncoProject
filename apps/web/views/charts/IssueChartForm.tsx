'use client';

import { useActionState } from 'react';

import { issueChart, type IssueChartField, type IssueChartState } from '@/app/charts/new/actions';

interface FieldProps {
  name: IssueChartField;
  label: string;
  hint?: string;
  defaultValue?: string;
  errors?: string[];
  inputMode?: 'numeric';
  required?: boolean;
  maxLength?: number;
}

/** A labelled input; its hint and error are linked by aria-describedby so screen readers read them with the field. */
function Field({ name, label, hint, defaultValue, errors, inputMode, required, maxLength }: FieldProps) {
  const hintId = `${name}-hint`;
  const errorId = `${name}-error`;
  const describedBy = [hint ? hintId : null, errors ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
        {!required && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      <input
        id={name}
        name={name}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        required={required}
        maxLength={maxLength}
        defaultValue={defaultValue}
        aria-invalid={errors ? true : undefined}
        aria-describedby={describedBy}
        className="min-h-11 rounded-[10px] border border-line bg-surface px-3 py-2 text-base aria-invalid:border-red-600"
      />
      {errors && (
        <p id={errorId} className="text-sm text-red-600">
          {errors[0]}
        </p>
      )}
    </div>
  );
}

const NO_PATIENT_DATA = 'A short pointer only. Never a patient name or clinical detail.';

export default function IssueChartForm() {
  const [state, formAction, pending] = useActionState<IssueChartState, FormData>(issueChart, {});
  const { values = {}, fieldErrors = {} } = state;

  return (
    <form action={formAction} className="flex w-full max-w-lg flex-col gap-5" noValidate>
      {state.message && (
        <p role="alert" className="rounded-md border border-red-300 p-3 text-sm text-red-700 dark:text-red-300">
          {state.message}
        </p>
      )}

      <Field
        name="rtNumber"
        label="RT number"
        hint="Typed in by the consultant who creates the file. Letters, digits and / . _ - only."
        defaultValue={values.rtNumber}
        errors={fieldErrors.rtNumber}
        required
        maxLength={40}
      />
      <Field
        name="plannedSessions"
        label="Planned sessions"
        hint="A whole number from 1 to 100."
        inputMode="numeric"
        defaultValue={values.plannedSessions}
        errors={fieldErrors.plannedSessions}
        required
        maxLength={3}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="priority" className="text-sm font-medium">
          Priority
        </label>
        <select
          id="priority"
          name="priority"
          // React resets a form after its action; a select only picks up a new default when it is remounted.
          key={values.priority ?? 'initial'}
          defaultValue={values.priority || 'ROUTINE'}
          aria-invalid={fieldErrors.priority ? true : undefined}
          className="min-h-11 rounded-[10px] border border-line bg-surface px-3 py-2 text-base"
        >
          <option value="ROUTINE">Routine</option>
          <option value="URGENT">Urgent</option>
        </select>
        {fieldErrors.priority && <p className="text-sm text-red-600">{fieldErrors.priority[0]}</p>}
      </div>

      <Field
        name="planId"
        label="Plan ID"
        hint={NO_PATIENT_DATA}
        defaultValue={values.planId}
        errors={fieldErrors.planId}
        maxLength={60}
      />
      <Field
        name="contourSetName"
        label="Contour set name"
        hint={NO_PATIENT_DATA}
        defaultValue={values.contourSetName}
        errors={fieldErrors.contourSetName}
        maxLength={60}
      />
      <Field
        name="scanReference"
        label="Scan reference"
        hint={NO_PATIENT_DATA}
        defaultValue={values.scanReference}
        errors={fieldErrors.scanReference}
        maxLength={60}
      />

      <button
        type="submit"
        disabled={pending}
        className="self-start min-h-11 rounded-[10px] bg-brand px-5 py-2 font-medium text-brand-ink disabled:opacity-60 hover:opacity-90"
      >
        {pending ? 'Issuing…' : 'Issue chart'}
      </button>
    </form>
  );
}
