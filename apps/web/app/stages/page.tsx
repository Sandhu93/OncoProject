import type { Metadata } from 'next';

import ChartService from '@/services/api/chart.service';
import StaffService from '@/services/api/staff.service';

import StageMapView from '@/views/charts/StageMapView';
import AppHeader from '@/views/layout/AppHeader';
import AutoRefresh from '@/views/layout/AutoRefresh';

export const metadata: Metadata = { title: 'Stages' };

// Per-user and read from the API: never prerendered at build time.
export const dynamic = 'force-dynamic';

export default async function StagesPage() {
  const [staff, queue] = await Promise.all([StaffService.me(), ChartService.queue()]);

  return (
    <>
      <AppHeader current="stages" fullName={staff.fullName} capabilities={staff.capabilities} />
      <main id="main" className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-5 sm:p-8">
        <AutoRefresh />

        <h1 className="text-2xl font-semibold">Stages</h1>
        <p className="text-sm text-muted">
          Where every open chart is in the workflow. A chart is stalled when it has waited {queue.stallDays} days or
          more.
        </p>

        <StageMapView stages={queue.stages} />
      </main>
    </>
  );
}
