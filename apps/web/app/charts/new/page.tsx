import Link from 'next/link';

import type { Metadata } from 'next';

import StaffService from '@/services/api/staff.service';

import IssueChartForm from '@/views/charts/IssueChartForm';
import AppHeader from '@/views/layout/AppHeader';

export const metadata: Metadata = { title: 'Issue a chart' };

// Per-user and read from the API: never prerendered at build time.
export const dynamic = 'force-dynamic';

/**
 * Only a consultant can issue a chart. The page says so for anyone else; the API enforces it either way,
 * because a page is only a convenience and the browser is not trusted.
 */
export default async function NewChartPage() {
  const staff = await StaffService.me();
  const allowed = staff.roles.includes('CONSULTANT');

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <AppHeader current="charts" fullName={staff.fullName} />
      <Link href="/charts" className="text-sm underline underline-offset-4">
        ← All charts
      </Link>
      <h1 className="text-2xl font-semibold">Issue a chart</h1>

      {allowed ? (
        <>
          <p className="text-zinc-600 dark:text-zinc-400">
            Create the chart for a new course. OncoTrack holds no patient names or other patient information: the RT
            number is the only identifier.
          </p>
          <IssueChartForm />
        </>
      ) : (
        <p role="status">Only a consultant can issue a chart.</p>
      )}
    </main>
  );
}
