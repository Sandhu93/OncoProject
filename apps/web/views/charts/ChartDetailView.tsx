import Link from 'next/link';

import type { ChartDetail, StageSummary } from '@oncotrack/contracts';

import { formatDateTime, formatDay, formatDuration } from '@/utils/format';
import { ROLE_LABELS } from '@/utils/labels';

import ActionForm from './ActionForm';
import CommentForm from './CommentForm';
import PriorityBadge from './PriorityBadge';
import StageStrip from './StageStrip';

const ACTION_LABELS: Record<string, string> = {
  ISSUE_CHART: 'Chart issued',
  GIVE_SIMULATION_DATES: 'Mould and CT Sim dates given',
  RECORD_MOULD_DONE: 'Mould done',
  RECORD_CT_SIM_DONE: 'CT Sim done',
  ASSIGN_CONTOURING: 'Contouring assigned',
  SUBMIT_CONTOURING: 'Contouring submitted',
  VERIFY_CONTOURING: 'Contouring verified',
  APPROVE_CONTOURING: 'Contouring approved',
  RETURN_CONTOURING: 'Contouring sent back',
  SUBMIT_PLAN: 'Plan submitted',
  APPROVE_PLAN: 'Plan approved',
  RETURN_PLAN: 'Plan sent back',
  SEND_PLAN_TO_LINAC: 'Plan sent to LINAC',
  INFORM_PATIENT: 'Patient told',
  START_TREATMENT: 'Treatment started',
  POST_WEEKLY_UPDATE: 'Saturday update',
  COMPLETE_TREATMENT: 'Treatment finished',
  POST_FINAL_UPDATE: 'Final update',
  REASSIGN_CONTOURING: 'Contouring reassigned',
  RETURN_TO_STAGE: 'Returned to an earlier stage',
  DISCONTINUE_CHART: 'Chart discontinued',
  REOPEN_CHART: 'Chart reopened',
};

const actionLabel = (action: string) => ACTION_LABELS[action] ?? action.replaceAll('_', ' ').toLowerCase();

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

const orDash = (value: string | number | null) => (value === null || value === '' ? '—' : value);

export default function ChartDetailView({
  chart,
  stages = [],
}: {
  chart: ChartDetail;
  /** The workflow's stages, for the progress strip; left out, the strip is not drawn. */
  stages?: readonly StageSummary[];
}) {
  const yourTurn = chart.availableActions.length > 0;

  return (
    <article className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/charts" className="inline-block self-start py-1 text-sm font-medium text-brand hover:underline">
          ← All charts
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-[1.625rem] font-bold leading-tight sm:text-3xl">{chart.rtNumber}</h1>
          <PriorityBadge priority={chart.priority} />
        </div>
        <p className="text-muted">
          {chart.stage.label} for {formatDuration(chart.minutesInStage)}
          {chart.phase && ` · ${chart.phase}`}
          {chart.status !== 'OPEN' && ` · ${chart.status === 'CLOSED' ? 'closed' : 'discontinued'}`}
        </p>
      </div>

      {stages.length > 0 && (
        <StageStrip stages={stages} currentCode={chart.stage.code} currentLabel={chart.stage.label} />
      )}

      <section
        aria-labelledby="next"
        className={`flex flex-col gap-4 rounded-xl border bg-surface p-5 sm:p-6 ${yourTurn ? 'border-2 border-brand' : 'border-line'}`}
      >
        <h2 id="next" className="text-xl font-bold">
          {yourTurn ? 'Your turn' : 'What happens next'}
        </h2>
        {chart.status === 'OPEN' && chart.waitingFor ? (
          <p>
            Waiting for {chart.waitingFor}
            {chart.ownerRole && ` (${ROLE_LABELS[chart.ownerRole]})`}.
          </p>
        ) : (
          <p>Nothing more to do: tracking ends here.</p>
        )}
        {chart.weekly && (
          <p>
            Saturday updates for the week ending {formatDay(chart.weekly.weekEnding)}:{' '}
            {chart.weekly.updates
              .map(update => `${ROLE_LABELS[update.role]} ${update.posted ? 'posted' : 'not yet'}`)
              .join(', ')}
            .
          </p>
        )}
        {chart.availableActions.map(action => (
          <ActionForm key={action.action} rtNumber={chart.rtNumber} version={chart.version} action={action} />
        ))}
        {yourTurn && <p className="text-sm text-muted">Take your time. Nothing is sent until you press the button.</p>}
        {chart.availableActions.length === 0 && chart.ownerRole && (
          <p className="text-sm text-muted">This step is not yours to take.</p>
        )}
      </section>

      {chart.controls.length > 0 && (
        <section aria-labelledby="controls" className="flex flex-col gap-3">
          <h2 id="controls" className="text-lg font-semibold">
            Consultant controls
          </h2>
          <p className="text-sm text-muted">
            For putting right what went wrong. Each one needs a reason, is kept in the history, and tells the people it
            affects.
          </p>
          {chart.controls.map(control => (
            <details key={control.action} className="rounded-md border border-zinc-300 p-3 dark:border-zinc-700">
              <summary className="flex min-h-11 cursor-pointer items-center font-medium">{control.label}</summary>
              <div className="mt-3">
                <ActionForm rtNumber={chart.rtNumber} version={chart.version} action={control} />
              </div>
            </details>
          ))}
        </section>
      )}

      {chart.recorded.length > 0 && (
        <section aria-labelledby="recorded" className="flex flex-col gap-3">
          <h2 id="recorded" className="text-lg font-semibold">
            Recorded so far
          </h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            {chart.recorded.map(fact => (
              <Fact key={fact.label} label={fact.label}>
                {fact.value}
              </Fact>
            ))}
          </dl>
        </section>
      )}

      <details open className="rounded-xl border border-line bg-surface">
        <summary className="flex min-h-11 cursor-pointer items-center px-5 py-3 text-lg font-semibold">
          About this chart
        </summary>
        <dl className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <Fact label="Current stage">{chart.stage.label}</Fact>
          <Fact label="In this stage since">{formatDateTime(chart.stageSince)}</Fact>
          <Fact label="Priority">
            <PriorityBadge priority={chart.priority} />
          </Fact>
          <Fact label="Planned sessions">{orDash(chart.plannedSessions)}</Fact>
          <Fact label="Plan ID">{orDash(chart.planId)}</Fact>
          <Fact label="Contour set name">{orDash(chart.contourSetName)}</Fact>
          <Fact label="Scan reference">{orDash(chart.scanReference)}</Fact>
          <Fact label="Issued by">{chart.issuedBy}</Fact>
        </dl>
      </details>

      <section aria-labelledby="discussion" className="flex flex-col gap-3">
        <h2 id="discussion" className="text-lg font-semibold">
          Discussion
        </h2>
        {chart.comments.length === 0 ? (
          <p className="text-sm text-muted">No comments yet.</p>
        ) : (
          <ol aria-label="Comments, oldest first" className="flex flex-col gap-3">
            {chart.comments.map(comment => (
              <li
                key={comment.id}
                className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
                data-kind={comment.kind}
              >
                <p className="text-sm text-muted">
                  <span className="font-medium text-foreground">{comment.authorName}</span> (
                  {comment.authorRoles.map(role => ROLE_LABELS[role]).join(', ')}) · {formatDateTime(comment.createdAt)}{' '}
                  · at {comment.stageLabel}
                  {comment.kind === 'HANDOFF' && ' · note when passing the chart on'}
                  {comment.forRole && ` · for ${ROLE_LABELS[comment.forRole]}`}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{comment.body}</p>
              </li>
            ))}
          </ol>
        )}
        <CommentForm rtNumber={chart.rtNumber} />
      </section>

      <section aria-labelledby="history" className="flex flex-col gap-3">
        <h2 id="history" className="text-lg font-semibold">
          History
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-left">
            <caption className="sr-only">Everything that has happened to this chart, oldest first</caption>
            <thead>
              <tr className="border-b border-zinc-300 text-sm dark:border-zinc-700">
                <th scope="col" className="py-2 pr-4 font-medium">
                  When
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  What
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Stage
                </th>
                <th scope="col" className="py-2 font-medium">
                  By
                </th>
              </tr>
            </thead>
            <tbody>
              {chart.history.map(entry => (
                <tr key={`${entry.occurredAt}-${entry.action}`} className="border-b border-line">
                  <td className="py-2 pr-4">{formatDateTime(entry.occurredAt)}</td>
                  <td className="py-2 pr-4">
                    {actionLabel(entry.action)}
                    {entry.summary && <span className="block text-sm text-muted">{entry.summary}</span>}
                    {entry.reason && !entry.summary?.includes(entry.reason) && (
                      <span className="block text-sm text-muted">Reason: {entry.reason}</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {entry.fromStageLabel && entry.fromStage !== entry.toStage
                      ? `${entry.fromStageLabel} → ${entry.toStageLabel}`
                      : entry.toStageLabel}
                  </td>
                  <td className="py-2">{entry.actorName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </article>
  );
}
