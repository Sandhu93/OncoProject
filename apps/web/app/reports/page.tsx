import type { Metadata } from 'next';

import { ApiError } from '@/services/api/api-errors';
import ReportsService from '@/services/api/reports.service';
import StaffService from '@/services/api/staff.service';

import NoAccess from '@/views/admin/NoAccess';
import AppHeader from '@/views/layout/AppHeader';
import ReportsView, { RangeForm } from '@/views/reports/ReportsView';

export const metadata: Metadata = { title: 'Reports' };

// Per-user and read from the API: never prerendered at build time.
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const asked = { from: first(params.from).trim(), to: first(params.to).trim() };
  const staff = await StaffService.me();
  const allowed = staff.capabilities.includes('EXPORT_REPORTS');

  let report = null;
  let problems: Record<string, string[]> | undefined;

  if (allowed) {
    try {
      report = await ReportsService.report({ from: asked.from || undefined, to: asked.to || undefined });
    } catch (error) {
      // A range the API refuses is shown beside the dates, not as a broken page.
      if (!(error instanceof ApiError) || error.status !== 400) throw error;

      problems = error.fieldErrors;
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-8">
      <AppHeader current="reports" fullName={staff.fullName} capabilities={staff.capabilities} />

      <h1 className="text-2xl font-semibold">Reports</h1>

      {!allowed ? (
        <NoAccess what="read the reports" />
      ) : (
        <>
          <RangeForm from={report?.range.from ?? asked.from} to={report?.range.to ?? asked.to} problems={problems} />
          {report && <ReportsView report={report} />}
        </>
      )}
    </main>
  );
}
