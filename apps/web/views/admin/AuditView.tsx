import Link from 'next/link';

import type { AuditList } from '@oncotrack/contracts';

import { formatDateTime } from '@/utils/format';

import { chartHref } from '@/views/charts/ChartTable';

export interface AuditFilters {
  rt: string;
  action: string;
  person: string;
  from: string;
  to: string;
}

/** "STAFF_PASSWORD_RESET" read as "Staff password reset". */
export const actionLabel = (action: string): string => {
  const words = action.toLowerCase().replaceAll('_', ' ');

  return words.charAt(0).toUpperCase() + words.slice(1);
};

const INPUT = 'rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900';

/** A plain GET form, so a filtered view can be bookmarked or shared. */
export function AuditFilterForm({ filters, actions }: { filters: AuditFilters; actions: readonly string[] }) {
  return (
    <form method="get" action="/audit" role="search" className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="rt" className="text-sm font-medium">
          RT number
        </label>
        <input id="rt" name="rt" defaultValue={filters.rt} maxLength={40} autoComplete="off" className={INPUT} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="action" className="text-sm font-medium">
          What happened
        </label>
        <select id="action" name="action" defaultValue={filters.action} className={INPUT}>
          <option value="">Anything</option>
          {actions.map(action => (
            <option key={action} value={action}>
              {actionLabel(action)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="person" className="text-sm font-medium">
          Who
        </label>
        <input
          id="person"
          name="person"
          defaultValue={filters.person}
          maxLength={60}
          autoComplete="off"
          className={INPUT}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="from" className="text-sm font-medium">
          From
        </label>
        <input id="from" name="from" type="date" defaultValue={filters.from} className={INPUT} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="to" className="text-sm font-medium">
          To
        </label>
        <input id="to" name="to" type="date" defaultValue={filters.to} className={INPUT} />
      </div>
      <button
        type="submit"
        className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Search
      </button>
    </form>
  );
}

/** The audit trail, newest first. Each entry can be opened to show the values before and after. */
export default function AuditView({ list }: { list: AuditList }) {
  if (list.items.length === 0) {
    return <p role="status">Nothing in the audit trail matches this search.</p>;
  }

  return (
    <ul aria-label="Audit trail" className="flex flex-col gap-2">
      {list.items.map(entry => {
        const hasValues = entry.before != null || entry.after != null;

        return (
          <li key={entry.id} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-semibold">{actionLabel(entry.action)}</span>
              {entry.rtNumber && (
                <Link href={chartHref(entry.rtNumber)} className="text-sm underline underline-offset-4">
                  {entry.rtNumber}
                </Link>
              )}
              <span className="ml-auto text-sm text-zinc-600 dark:text-zinc-400">
                {formatDateTime(entry.occurredAt)}
              </span>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {entry.actorName ?? 'The system'}
              {entry.actorRoles.length > 0 && ` (${entry.actorRoles.join(', ').toLowerCase().replaceAll('_', ' ')})`}
              {' · '}
              {entry.entityType.toLowerCase().replaceAll('_', ' ')}
            </p>
            {hasValues && (
              <details className="mt-1">
                <summary className="cursor-pointer text-sm underline underline-offset-4">Values</summary>
                <pre className="mt-2 overflow-x-auto rounded bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
                  {JSON.stringify({ before: entry.before ?? null, after: entry.after ?? null }, null, 2)}
                </pre>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}
