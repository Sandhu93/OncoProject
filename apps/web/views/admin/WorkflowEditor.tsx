'use client';

import { useActionState } from 'react';

import { CLINICAL_ROLES, type WorkflowDraft } from '@oncotrack/contracts';

import { ROLE_LABELS } from '@/utils/labels';

import { approveDraft, discardDraft, saveDraft, startDraft, type WorkflowFormState } from '@/app/workflow/edit/actions';

const INPUT = 'min-h-11 rounded-[10px] border border-line bg-surface px-3 py-2 text-base aria-invalid:border-red-600';
const BUTTON =
  'self-start min-h-11 rounded-[10px] bg-brand px-5 py-2 text-brand-ink disabled:opacity-60 hover:opacity-90';
const SECONDARY = 'self-start rounded-md border border-zinc-400 px-4 py-2 disabled:opacity-60 dark:border-zinc-600';

function Messages({ state }: { state: WorkflowFormState }) {
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

const noInput = async (action: () => Promise<WorkflowFormState>): Promise<WorkflowFormState> => action();

/** Nothing is being prepared yet: explain, and offer to start. */
export function StartDraft() {
  const [state, formAction, pending] = useActionState<WorkflowFormState>(() => noInput(startDraft), {});

  return (
    <form action={formAction} aria-label="Start a draft" className="flex max-w-xl flex-col gap-3">
      <p>
        A draft is a copy of the workflow in use that you can change without affecting anyone, review, and then approve.
        You can change names, who may do each step, and who posts the Saturday updates. New stages or new kinds of step
        need the program itself to change.
      </p>
      <Messages state={state} />
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? 'Starting…' : 'Start a draft'}
      </button>
    </form>
  );
}

/** The draft: what can be changed, what will change, and the choice to approve or throw it away. */
export default function WorkflowEditor({ draft }: { draft: WorkflowDraft }) {
  const [saved, saveAction, saving] = useActionState<WorkflowFormState, FormData>(saveDraft, {});
  const [approved, approveAction, approving] = useActionState<WorkflowFormState>(() => noInput(approveDraft), {});
  const [discarded, discardAction, discarding] = useActionState<WorkflowFormState>(() => noInput(discardDraft), {});
  const errors = saved.fieldErrors ?? {};
  const first = (field: string) => errors[field]?.[0];

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-muted">
        Draft version {draft.version}, to replace version {draft.replacesVersion}. Charts already running finish on the
        version they started with. Charts issued after you approve this start on it.
      </p>

      <form action={saveAction} aria-label="Edit the draft" className="flex flex-col gap-6" noValidate>
        <div className="flex max-w-lg flex-col gap-1">
          <label htmlFor="wf-label" className="text-sm font-medium">
            Name of this workflow
          </label>
          <input
            id="wf-label"
            name="label"
            defaultValue={draft.label}
            maxLength={120}
            aria-invalid={first('label') ? true : undefined}
            className={INPUT}
          />
          {first('label') && <p className="text-sm text-red-600">{first('label')}</p>}
        </div>

        <ol aria-label="Stages" className="flex flex-col gap-4">
          {draft.stages.map((stage, index) => {
            const steps = draft.steps.filter(step => step.from === stage.code);

            return (
              <li key={stage.code} className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="flex max-w-lg flex-col gap-1">
                  <label htmlFor={`stage-${stage.code}`} className="text-sm font-medium">
                    Stage {stage.position}
                  </label>
                  <input
                    id={`stage-${stage.code}`}
                    name={`stage:${stage.code}`}
                    defaultValue={stage.label}
                    maxLength={80}
                    aria-invalid={Object.keys(errors).some(key => key.startsWith(`stages.${index}`)) ? true : undefined}
                    className={INPUT}
                  />
                  {errors[`stages.${index}.label`] && (
                    <p className="text-sm text-red-600">{errors[`stages.${index}.label`]![0]}</p>
                  )}
                </div>

                {stage.weeklyUpdateRoles.length > 0 && (
                  <fieldset className="mt-3 flex flex-col gap-1">
                    <legend className="text-sm font-medium">Saturday update from</legend>
                    <input type="hidden" name={`hasWeekly:${stage.code}`} value="1" />
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {CLINICAL_ROLES.map(role => (
                        <label key={role} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            name={`weekly:${stage.code}`}
                            value={role}
                            defaultChecked={stage.weeklyUpdateRoles.includes(role)}
                          />
                          {ROLE_LABELS[role]}
                        </label>
                      ))}
                    </div>
                    {errors[`stages.${index}.weeklyUpdateRoles`] && (
                      <p className="text-sm text-red-600">{errors[`stages.${index}.weeklyUpdateRoles`]![0]}</p>
                    )}
                  </fieldset>
                )}

                {steps.map(step => {
                  const stepIndex = draft.steps.indexOf(step);

                  return (
                    <fieldset key={`${step.from}|${step.action}`} className="mt-3 flex flex-col gap-1">
                      <legend className="text-sm font-medium">
                        {step.actionLabel} → {step.toLabel}
                      </legend>
                      <input type="hidden" name={`hasSteps:${step.from}|${step.action}`} value="1" />
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {CLINICAL_ROLES.map(role => (
                          <label key={role} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              name={`step:${step.from}|${step.action}`}
                              value={role}
                              defaultChecked={step.roles.includes(role)}
                              aria-label={`${ROLE_LABELS[role]} may ${step.actionLabel} at ${stage.label}`}
                            />
                            {ROLE_LABELS[role]}
                          </label>
                        ))}
                      </div>
                      {errors[`steps.${stepIndex}.roles`] && (
                        <p className="text-sm text-red-600">{errors[`steps.${stepIndex}.roles`]![0]}</p>
                      )}
                    </fieldset>
                  );
                })}
              </li>
            );
          })}
        </ol>

        {errors.stages && <p className="text-sm text-red-600">{errors.stages[0]}</p>}
        <Messages state={saved} />
        <button type="submit" disabled={saving} className={BUTTON}>
          {saving ? 'Saving…' : 'Save changes to the draft'}
        </button>
      </form>

      <section aria-labelledby="changes-title" className="flex max-w-2xl flex-col gap-2">
        <h2 id="changes-title" className="text-lg font-semibold">
          What will change
        </h2>
        {draft.changes.length === 0 ? (
          <p role="status">Nothing yet. The draft is the same as the workflow in use.</p>
        ) : (
          <ul className="list-disc pl-5">
            {draft.changes.map(change => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-6">
        <form action={approveAction} aria-label="Approve the draft" className="flex flex-col gap-2">
          <Messages state={approved} />
          <button type="submit" disabled={approving || draft.changes.length === 0} className={BUTTON}>
            {approving ? 'Approving…' : 'Approve and use for new charts'}
          </button>
        </form>
        <form action={discardAction} aria-label="Discard the draft" className="flex flex-col gap-2">
          <Messages state={discarded} />
          <button type="submit" disabled={discarding} className={SECONDARY}>
            {discarding ? 'Discarding…' : 'Discard the draft'}
          </button>
        </form>
      </div>
    </div>
  );
}
