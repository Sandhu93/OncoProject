import { notFound } from 'next/navigation';

import type { Metadata } from 'next';

import { ApiError } from '@/services/api/api-errors';
import ChartService from '@/services/api/chart.service';
import StaffService from '@/services/api/staff.service';

import ChartDetailView from '@/views/charts/ChartDetailView';
import AppHeader from '@/views/layout/AppHeader';

// Per-user and read from the API: never prerendered at build time.
export const dynamic = 'force-dynamic';

type Params = Promise<{ rtNumber: string }>;

/** An RT number can contain "/", which arrives encoded. It never contains "%", so decoding twice is harmless. */
const readRtNumber = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return { title: `Chart ${readRtNumber((await params).rtNumber)}` };
}

export default async function ChartPage({ params }: { params: Params }) {
  const rtNumber = readRtNumber((await params).rtNumber);

  const [staff, chart] = await Promise.all([
    StaffService.me(),
    ChartService.find(rtNumber).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) notFound();

      throw error;
    }),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <AppHeader current="charts" fullName={staff.fullName} />
      <ChartDetailView chart={chart} />
    </main>
  );
}
