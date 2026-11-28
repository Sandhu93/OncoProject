import type { WorkflowView as Workflow } from '@oncotrack/contracts';

import { formatDateTime } from '@/utils/format';
import { ROLE_LABELS } from '@/utils/labels';

/** The approved workflow, to read: every stage, then every step between stages. */
export default function WorkflowView({ workflow }: { workflow: Workflow | null }) {
  if (!workflow) {
    return <p role="status">No workflow has been approved yet.</p>;
  }

  const steps = (stage: string) => workflow.transitions.filter(transition => transition.from === stage);

  return (
    <>
      <p>
        {workflow.label}, version {workflow.version}.{' '}
        {workflow.approvedAt
          ? `Approved${workflow.approvedBy ? ` by ${workflow.approvedBy}` : ''} on ${formatDateTime(workflow.approvedAt)}.`
          : 'Not yet approved.'}
      </p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        This is the workflow in use. It can only be changed by approving a new version, so charts already in progress
        keep the steps they started with.
      </p>

      <ol aria-label="Stages" className="flex flex-col gap-3">
        {workflow.stages.map(stage => (
          <li key={stage.code} className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="text-base font-semibold">
              {stage.position}. {stage.label}
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {[
                stage.phase,
                stage.isInitial ? 'Where every chart starts' : null,
                stage.isTerminal ? 'Where tracking ends' : null,
                stage.weeklyUpdateRoles.length > 0
                  ? `Saturday update: ${stage.weeklyUpdateRoles.map(role => ROLE_LABELS[role]).join(' and ')}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>

            {steps(stage.code).length === 0 ? (
              <p className="mt-2 text-sm">No further steps.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {steps(stage.code).map(step => (
                  <li key={`${step.action}:${step.role}:${step.to}`}>
                    <strong>{step.actionLabel}</strong> by {ROLE_LABELS[step.role]} → {step.toLabel}
                    {step.requiresReason && ' (a reason is needed)'}
                    {step.requiresAssignment && ' (only the person it is assigned to)'}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}
