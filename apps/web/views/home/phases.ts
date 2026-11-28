import type { StageSummary } from '@oncotrack/contracts';

export interface PhaseCount {
  name: string;
  open: number;
  stalled: number;
}

/** The workflow's stages rolled up into its phases, in workflow order: how many open charts are in each. */
export function phaseCounts(stages: readonly StageSummary[]): PhaseCount[] {
  const phases: PhaseCount[] = [];

  for (const stage of stages) {
    const name = stage.phase ?? 'Other';
    const last = phases.at(-1);

    if (last?.name === name) {
      last.open += stage.open;
      last.stalled += stage.stalled;
    } else {
      phases.push({ name, open: stage.open, stalled: stage.stalled });
    }
  }

  return phases;
}

/** "Good morning" and so on, by the hour in India, where the department is. */
export function greeting(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(now),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** "1 chart" or "4 charts". */
export const chartsText = (count: number): string => `${count} ${count === 1 ? 'chart' : 'charts'}`;
