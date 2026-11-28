import type { QueueItem } from '@oncotrack/contracts';

/** "Just moved", "1 day here", "4 days here"; "Treatment day 9" once treatment has started. */
export function ageText(item: QueueItem): string {
  if (item.treatmentDay !== null) return `Treatment day ${item.treatmentDay}`;
  if (item.daysInStage <= 0) return 'Just moved';
  return item.daysInStage === 1 ? '1 day here' : `${item.daysInStage} days here`;
}

/** The sentence at the top of the queue. */
export function queueSummary(needing: number, stalledAmongThem: number, stallDays: number): string {
  if (needing === 0) return 'Nothing needs you right now.';
  const base = `${needing} ${needing === 1 ? 'chart needs' : 'charts need'} you`;
  if (stalledAmongThem === 0) return `${base}.`;
  const waited = stalledAmongThem === 1 ? 'has' : 'have';
  return `${base}, and ${stalledAmongThem} ${waited} been waiting more than ${stallDays} days.`;
}

export const OVERVIEW_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'stalled', label: 'Stalled' },
  { value: 'getting-ready', label: 'Getting ready' },
  { value: 'in-treatment', label: 'In treatment' },
] as const;

export type OverviewFilter = (typeof OVERVIEW_FILTERS)[number]['value'];

export function matchesFilter(item: QueueItem, filter: OverviewFilter): boolean {
  switch (filter) {
    case 'stalled':
      return item.stalled;
    case 'getting-ready':
      return item.treatmentDay === null && item.stage.code !== 'TREATMENT_IN_PROGRESS';
    case 'in-treatment':
      return item.stage.code === 'TREATMENT_IN_PROGRESS';
    default:
      return true;
  }
}

/** The all-charts order: furthest along first, then the longest wait. */
export function overviewOrder(a: QueueItem, b: QueueItem): number {
  return b.stageNumber - a.stageNumber || b.daysInStage - a.daysInStage || a.rtNumber.localeCompare(b.rtNumber);
}
