'use client';

import { useActionState } from 'react';

import { CLINICAL_ROLES } from '@oncotrack/contracts';

import { ROLE_LABELS } from '@/utils/labels';

import { type CommentState, postComment } from '@/app/charts/[rtNumber]/comment-actions';

const INPUT = 'min-h-11 rounded-[10px] border border-line bg-surface px-3 py-2 text-base aria-invalid:border-red-600';

/** Write a comment on the chart, optionally for one role, who is then told. */
export default function CommentForm({ rtNumber }: { rtNumber: string }) {
  const [state, formAction, pending] = useActionState<CommentState, FormData>(postComment, {});
  const bodyErrors = state.fieldErrors?.body;
  const roleErrors = state.fieldErrors?.forRole;
  // A saved comment clears the form: the fields are remounted with nothing in them.
  const fresh = state.posted ? 'posted' : 'editing';

  return (
    <form action={formAction} aria-labelledby="comment-title" className="flex max-w-lg flex-col gap-3" noValidate>
      <h3 id="comment-title" className="text-base font-semibold">
        Add a comment
      </h3>
      <input type="hidden" name="rtNumber" value={rtNumber} />

      <div className="flex flex-col gap-1">
        <label htmlFor="comment-body" className="text-sm font-medium">
          Comment
        </label>
        <p id="comment-body-hint" className="text-sm text-muted">
          Operational notes only: no patient names or clinical details.
        </p>
        <textarea
          key={`body:${fresh}`}
          id="comment-body"
          name="body"
          rows={3}
          maxLength={1000}
          required
          defaultValue={state.values?.body ?? ''}
          aria-invalid={bodyErrors ? true : undefined}
          aria-describedby={['comment-body-hint', bodyErrors ? 'comment-body-error' : null].filter(Boolean).join(' ')}
          className={INPUT}
        />
        {bodyErrors && (
          <p id="comment-body-error" className="text-sm text-red-600">
            {bodyErrors[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="comment-for" className="text-sm font-medium">
          For <span className="font-normal text-muted">(optional)</span>
        </label>
        <p id="comment-for-hint" className="text-sm text-muted">
          That role is told. If you choose no one, whoever the chart is waiting for is told.
        </p>
        <select
          key={`for:${fresh}`}
          id="comment-for"
          name="forRole"
          defaultValue={state.values?.forRole ?? ''}
          aria-invalid={roleErrors ? true : undefined}
          aria-describedby="comment-for-hint"
          className={INPUT}
        >
          <option value="">Whoever the chart is waiting for</option>
          {CLINICAL_ROLES.map(role => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </div>

      {state.message && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
      {state.posted && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          Comment added.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start min-h-11 rounded-[10px] bg-brand px-5 py-2 text-brand-ink disabled:opacity-60 hover:opacity-90"
      >
        {pending ? 'Adding…' : 'Add comment'}
      </button>
    </form>
  );
}
