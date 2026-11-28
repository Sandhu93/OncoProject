import Link from 'next/link';

import type { Metadata } from 'next';

import { formatDay } from '@/utils/format';

import ChartService from '@/services/api/chart.service';
import StaffService from '@/services/api/staff.service';

import { matchesFilter, OVERVIEW_FILTERS, type OverviewFilter, overviewOrder } from '@/views/charts/queue';
import { KpiTiles, OverviewTable } from '@/views/charts/QueueViews';
import AppHeader from '@/views/layout/AppHeader';
import AutoRefresh from '@/views/layout/AutoRefresh';

export const metadata: Metadata = { title: 'Overview' };

// Per-user and read from the API: never prerendered at build time.
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function OverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const raw = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  const filter: OverviewFilter = OVERVIEW_FILTERS.find(option => option.value === raw)?.value ?? 'all';

  const [staff, queue] = await Promise.all([StaffService.me(), ChartService.queue()]);
  const counts = Object.fromEntries(
    OVERVIEW_FILTERS.map(option => [
      option.value,
      queue.items.filter(item => matchesFilter(item, option.value)).length,
    ]),
  );
  const shown = queue.items.filter(item => matchesFilter(item, filter)).sort(overviewOrder);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-8">
      <AppHeader current="overview" fullName={staff.fullName} capabilities={staff.capabilities} />
      <AutoRefresh />

      <h1 className="text-2xl font-semibold">Overview</h1>

      <KpiTiles totals={queue.totals} stallDays={queue.stallDays} />

      <nav aria-label="Show" className="flex flex-wrap gap-2">
        {OVERVIEW_FILTERS.map(option => (
          <Link
            key={option.value}
            href={option.value === 'all' ? '/overview' : `/overview?filter=${option.value}`}
            aria-current={filter === option.value ? 'page' : undefined}
            className="rounded-full border border-zinc-300 px-3 py-1 text-sm aria-[current=page]:bg-zinc-900 aria-[current=page]:text-white dark:border-zinc-700 dark:aria-[current=page]:bg-zinc-100 dark:aria-[current=page]:text-zinc-900"
          >
            {option.label} ({counts[option.value]})
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? <p role="status">No charts match this view.</p> : <OverviewTable items={shown} />}

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Saturday updates to come counts each role that has not yet posted this week (week ending{' '}
        {formatDay(queue.weekEnding)}). OncoTrack holds no patient names or other patient information.
      </p>
    </main>
  );
}
