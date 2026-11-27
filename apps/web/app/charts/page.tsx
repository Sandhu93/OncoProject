import Link from 'next/link';

import type { Metadata } from 'next';

import ChartService from '@/services/api/chart.service';
import StaffService from '@/services/api/staff.service';

import ChartFilters, { STATUS_OPTIONS } from '@/views/charts/ChartFilters';
import ChartTable from '@/views/charts/ChartTable';
import Pagination from '@/views/charts/Pagination';
import AppHeader from '@/views/layout/AppHeader';

export const metadata: Metadata = { title: 'Charts' };

// Per-user and read from the API: never prerendered at build time.
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

export default async function ChartsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 40);
  const requested = first(params.status);
  const status = STATUS_OPTIONS.some(option => option.value === requested) ? requested : 'OPEN';
  const page = Math.max(Number.parseInt(first(params.page), 10) || 1, 1);

  const [staff, charts] = await Promise.all([
    StaffService.me(),
    ChartService.list({
      q: q || undefined,
      status: status === 'ALL' ? undefined : status,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
  ]);

  const hrefForPage = (target: number) => {
    const next = new URLSearchParams();

    if (q) next.set('q', q);
    next.set('status', status);
    if (target > 1) next.set('page', String(target));

    return `/charts?${next.toString()}`;
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-8">
      <AppHeader current="charts" fullName={staff.fullName} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Charts</h1>
        {staff.roles.includes('CONSULTANT') && (
          <Link
            href="/charts/new"
            className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Issue a chart
          </Link>
        )}
      </div>

      <ChartFilters q={q} status={status} />

      {charts.items.length === 0 ? (
        <p role="status">{q || status !== 'OPEN' ? 'No charts match this search.' : 'No charts yet.'}</p>
      ) : (
        <>
          <ChartTable charts={charts.items} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={charts.total} hrefForPage={hrefForPage} />
        </>
      )}

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        OncoTrack holds no patient names or other patient information. Find the patient in the hospital&apos;s own
        records using the RT number.
      </p>
    </main>
  );
}
