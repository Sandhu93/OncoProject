'use client';

import { useActionState } from 'react';

import type { ActionField, AvailableAction } from '@oncotrack/contracts';

import { type ActionState, performAction } from '@/app/charts/[rtNumber]/actions';

interface ActionFormProps {
  rtNumber: string;
  /** The chart version the person is looking at; the API refuses the step if the chart has moved on. */
  version: number;
  action: AvailableAction;
}

const INPUT = 'min-h-11 rounded-[10px] border border-line bg-surface px-3 py-2 text-base aria-invalid:border-red-600';

/** One field of a step, drawn from the API's description of it. Its hint and error are linked for screen readers. */
function Field({
  field,
  formId,
  value,
  errors,
}: {
  field: ActionField;
  formId: string;
  value: string | undefined;
  errors: string[] | undefined;
}) {
  const id = `${formId}-${field.key}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [field.help ? hintId : null, errors ? errorId : null].filter(Boolean).join(' ') || undefined;
  const current = value ?? field.default ?? '';
  const shared = {
    id,
    name: field.key,
    required: field.required,
    defaultValue: current,
    'aria-invalid': errors ? true : undefined,
    'aria-describedby': describedBy,
    className: INPUT,
  } as const;
  // React resets a form after its action; a field only picks up a new default when it is remounted.
  // The key is passed on the element itself: React does not allow it inside spread props.
  const key = `${field.key}:${current}`;

  let control: React.ReactNode;

  switch (field.type) {
    case 'area':
      control = (
        <textarea key={key} {...shared} rows={3} maxLength={field.maxLength ?? 500} placeholder={field.placeholder} />
      );
      break;
    case 'date':
      control = <input key={key} {...shared} type="date" min={field.min} max={field.max} />;
      break;
    case 'time':
      control = <input key={key} {...shared} type="time" />;
      break;
    case 'number':
      control = (
        <input
          key={key}
          {...shared}
          type="text"
          inputMode="numeric"
          maxLength={4}
          autoComplete="off"
          placeholder={field.placeholder}
        />
      );
      break;
    case 'select':
    case 'staff':
      control = (
        <select key={key} {...shared}>
          {!field.required && <option value="">—</option>}
          {field.type === 'staff' && (field.options?.length ?? 0) === 0 && <option value="">No one to choose</option>}
          {field.options?.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
      break;
    default:
      control = (
        <input
          key={key}
          {...shared}
          type="text"
          autoComplete="off"
          maxLength={field.maxLength ?? 60}
          placeholder={field.placeholder}
        />
      );
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {field.label}
        {!field.required && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {field.help && (
        <p id={hintId} className="text-sm text-muted">
          {field.help}
        </p>
      )}
      {control}
      {errors && (
        <p id={errorId} className="text-sm text-red-600">
          {errors[0]}
        </p>
      )}
    </div>
  );
}

export default function ActionForm({ rtNumber, version, action }: ActionFormProps) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(performAction, {});
  const formId = `step-${action.action}`;

  return (
    <form action={formAction} aria-labelledby={`${formId}-title`} className="flex max-w-lg flex-col gap-4" noValidate>
      <h3 id={`${formId}-title`} className="text-base font-semibold">
        {action.label}
      </h3>

      <input type="hidden" name="rtNumber" value={rtNumber} />
      <input type="hidden" name="action" value={action.action} />
      <input type="hidden" name="expectedVersion" value={version} />

      {action.checks.length > 0 && (
        <ul
          aria-label="Before you start"
          className="flex flex-col gap-1 rounded-md border border-zinc-300 p-3 text-sm dark:border-zinc-700"
        >
          {action.checks.map(check => (
            <li key={check.label}>
              <span className="font-medium">{check.label}:</span> {check.ok ? 'Done' : 'Not yet'} — {check.detail}
            </li>
          ))}
        </ul>
      )}

      {state.message && (
        <p role="alert" className="rounded-md border border-red-300 p-3 text-sm text-red-700 dark:text-red-300">
          {state.message}
        </p>
      )}

      {action.fields.map(field =>
        field.type === 'heading' ? (
          <h4 key={field.key} className="pt-2 text-sm font-semibold">
            {field.label}
          </h4>
        ) : (
          <Field
            key={field.key}
            field={field}
            formId={formId}
            value={state.values?.[field.key]}
            errors={state.fieldErrors?.[field.key]}
          />
        ),
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start min-h-11 rounded-[10px] bg-brand px-5 py-2 font-medium text-brand-ink disabled:opacity-60 hover:opacity-90"
      >
        {pending ? 'Saving…' : action.requiresReason ? 'Send back' : action.label}
      </button>
    </form>
  );
}
