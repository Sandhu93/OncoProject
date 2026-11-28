import Link from 'next/link';

import type { StageSummary } from '@oncotrack/contracts';

import { chartHref } from './ChartTable';

/** Every stage of the workflow in order, grouped by phase, with the charts in each. */
export default function StageMapView({ stages }: { stages: readonly StageSummary[] }) {
  const phases: { name: string; stages: StageSummary[] }[] = [];

  for (const stage of stages) {
    const name = stage.phase ?? 'Other';
    const last = phases.at(-1);

    if (last?.name === name) last.stages.push(stage);
    else phases.push({ name, stages: [stage] });
  }

  if (stages.length === 0) {
    return <p role="status">No workflow is active yet.</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      {phases.map(phase => (
        <section key={phase.name} aria-label={phase.name} className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">{phase.name}</h2>
          <ol className="flex flex-col gap-2">
            {phase.stages.map(stage => (
              <li
                key={stage.code}
                aria-label={stage.label}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <span className="w-6 text-sm text-muted">{stage.position}</span>
                <span className="w-56 font-medium">{stage.label}</span>
                <span className="w-24">
                  {stage.open} open
                  {stage.stalled > 0 && (
                    <strong className="ml-2 text-red-700 dark:text-red-400">{stage.stalled} stalled</strong>
                  )}
                </span>
                <span className="flex flex-wrap gap-x-3">
                  {stage.charts.map(rtNumber => (
                    <Link key={rtNumber} href={chartHref(rtNumber)} className="underline underline-offset-4">
                      {rtNumber}
                    </Link>
                  ))}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
