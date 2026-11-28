import type { ChartPriority } from '@oncotrack/contracts';

/** Urgent charts stand out by text as well as colour. */
export default function PriorityBadge({ priority }: { priority: ChartPriority }) {
  return priority === 'URGENT' ? (
    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">
      Urgent
    </span>
  ) : (
    <span className="text-sm text-muted">Routine</span>
  );
}
