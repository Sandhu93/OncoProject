import type { Metadata } from 'next';

import ChartService from '@/services/api/chart.service';
import StaffService from '@/services/api/staff.service';

import CalendarView from '@/views/charts/CalendarView';
import AppHeader from '@/views/layout/AppHeader';
import AutoRefresh from '@/views/layout/AutoRefresh';

export const metadata: Metadata = { title: 'Calendar' };

// Per-user and read from the API: never prerendered at build time.
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const raw = Array.isArray(params.from) ? params.from[0] : params.from;
  // Only a plain date is passed on; anything else shows today.
  const from = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;

  const [staff, calendar] = await Promise.all([
    StaffService.me(),
    ChartService.calendar({ ...(from ? { from } : {}) }).catch(() => ChartService.calendar()),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-8">
      <AppHeader current="calendar" fullName={staff.fullName} />
      <AutoRefresh />

      <h1 className="text-2xl font-semibold">Calendar</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Mould, CT Sim and first treatment, from the dates given on each open chart.
      </p>

      <CalendarView calendar={calendar} />
    </main>
  );
}
