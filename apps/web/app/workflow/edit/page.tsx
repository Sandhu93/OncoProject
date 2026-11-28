import Link from 'next/link';

import type { Metadata } from 'next';

import AdminService from '@/services/api/admin.service';
import StaffService from '@/services/api/staff.service';

import NoAccess from '@/views/admin/NoAccess';
import WorkflowEditor, { StartDraft } from '@/views/admin/WorkflowEditor';
import AppHeader from '@/views/layout/AppHeader';

export const metadata: Metadata = { title: 'Change the workflow' };

// Per-user and read from the API: never prerendered at build time.
export const dynamic = 'force-dynamic';

export default async function EditWorkflowPage() {
  const staff = await StaffService.me();
  const allowed = staff.capabilities.includes('CONFIGURE_WORKFLOW');
  const draft = allowed ? await AdminService.workflowDraft() : null;

  return (
    <>
      <AppHeader current="workflow" fullName={staff.fullName} capabilities={staff.capabilities} />
      <main id="main" className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-5 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold">Change the workflow</h1>
          <Link href="/workflow" className="text-sm underline underline-offset-4">
            Back to the workflow
          </Link>
        </div>

        {!allowed ? <NoAccess what="change the workflow" /> : draft ? <WorkflowEditor draft={draft} /> : <StartDraft />}
      </main>
    </>
  );
}
