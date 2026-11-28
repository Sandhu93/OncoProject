import type { Metadata } from 'next';

import ChartService from '@/services/api/chart.service';
import StaffService from '@/services/api/staff.service';

import SaturdayView from '@/views/charts/SaturdayView';
import AppHeader from '@/views/layout/AppHeader';
import AutoRefresh from '@/views/layout/AutoRefresh';

export const metadata: Metadata = { title: 'Saturday updates' };

// Per-user and read from the API: never prerendered at build time.
export const dynamic = 'force-dynamic';

export default async function SaturdayPage() {
  const [staff, queue] = await Promise.all([StaffService.me(), ChartService.queue()]);

  return (
    <>
      <AppHeader current="saturday" fullName={staff.fullName} capabilities={staff.capabilities} />
      <main id="main" className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-5 sm:p-8">
        <AutoRefresh />

        <h1 className="text-2xl font-semibold">Saturday updates</h1>

        <SaturdayView queue={queue} />
      </main>
    </>
  );
}
