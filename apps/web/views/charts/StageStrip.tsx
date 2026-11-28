import type { StageSummary } from '@oncotrack/contracts';

interface Phase {
  name: string;
  state: 'done' | 'current' | 'upcoming';
}

/** The workflow's phases with the chart's place marked: finished, here, still to come. */
export function phasesFor(stages: readonly StageSummary[], currentCode: string): Phase[] {
  const current = stages.find(stage => stage.code === currentCode);
  const names: string[] = [];

  for (const stage of stages) {
    const name = stage.phase ?? 'Other';

    if (names.at(-1) !== name) names.push(name);
  }

  const here = names.indexOf(current?.phase ?? 'Other');

  return names.map((name, index) => ({
    name,
    state: index < here ? 'done' : index === here ? 'current' : 'upcoming',
  }));
}

const STYLE = {
  done: 'bg-brand text-brand-ink',
  current: 'border-2 border-brand bg-brand-soft font-semibold text-brand',
  upcoming: 'bg-line/60 text-muted',
} as const;

/** Where a chart is in the whole journey. The words say it too, so colour is never the only clue. */
export default function StageStrip({
  stages,
  currentCode,
  currentLabel,
}: {
  stages: readonly StageSummary[];
  currentCode: string;
  currentLabel: string;
}) {
  const phases = phasesFor(stages, currentCode);
  const position = stages.find(stage => stage.code === currentCode)?.position;

  if (phases.length === 0) return null;

  return (
    <section aria-label="Progress" className="flex flex-col gap-2">
      <ol className="flex flex-wrap gap-2">
        {phases.map(phase => (
          <li
            key={phase.name}
            aria-current={phase.state === 'current' ? 'step' : undefined}
            className={`rounded-full px-3.5 py-1.5 text-sm ${STYLE[phase.state]}`}
          >
            {phase.state === 'done' && <span aria-hidden="true">✓ </span>}
            {phase.name}
            <span className="sr-only">
              {phase.state === 'done' ? ' (done)' : phase.state === 'current' ? ' (here now)' : ' (still to come)'}
            </span>
          </li>
        ))}
      </ol>
      {position && (
        <p className="text-sm text-muted">
          Stage {position} of {stages.length}: {currentLabel}
        </p>
      )}
    </section>
  );
}
