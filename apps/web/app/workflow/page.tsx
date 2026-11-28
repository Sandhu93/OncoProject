import Link from 'next/link';

import type { Metadata } from 'next';

import AdminService from '@/services/api/admin.service';
import StaffService from '@/services/api/staff.service';

import WorkflowView from '@/views/admin/WorkflowView';
import AppHeader from '@/views/layout/AppHeader';

export const metadata: Metadata = { title: 'Workflow' };

// Per-user and read from the API: never prerendered at build time.
export const dynamic = 'force-dynamic';

export default async function WorkflowPage() {
  const [staff, workflow] = await Promise.all([StaffService.me(), AdminService.workflow()]);

  return (
    <>
      <AppHeader current="workflow" fullName={staff.fullName} capabilities={staff.capabilities} />
      <main id="main" className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-5 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold">Workflow</h1>
          {staff.capabilities.includes('CONFIGURE_WORKFLOW') && (
            <Link href="/workflow/edit" className="font-medium underline underline-offset-4">
              Change the workflow
            </Link>
          )}
        </div>

        <WorkflowView workflow={workflow} />
      </main>
    </>
  );
}
