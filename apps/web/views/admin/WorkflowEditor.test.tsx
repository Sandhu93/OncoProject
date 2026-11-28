import type { WorkflowDraft } from '@oncotrack/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { approveDraft, discardDraft, saveDraft, startDraft } from '@/app/workflow/edit/actions';

import WorkflowEditor, { StartDraft } from './WorkflowEditor';

vi.mock('@/app/workflow/edit/actions', () => ({
  startDraft: vi.fn(),
  saveDraft: vi.fn(),
  approveDraft: vi.fn(),
  discardDraft: vi.fn(),
}));

const draft = (change: Partial<WorkflowDraft> = {}): WorkflowDraft => ({
  code: 'RT_PROPOSED',
  version: 2,
  label: 'RT workflow',
  status: 'DRAFT',
  replacesVersion: 1,
  stages: [
    {
      code: 'A',
      label: 'Chart issued',
      phase: 'Getting ready',
      position: 1,
      isInitial: true,
      isTerminal: false,
      weeklyUpdateRoles: [],
    },
    {
      code: 'B',
      label: 'Treatment',
      phase: 'Treatment',
      position: 2,
      isInitial: false,
      isTerminal: false,
      weeklyUpdateRoles: ['JUNIOR_RESIDENT'],
    },
  ],
  steps: [
    {
      from: 'A',
      fromLabel: 'Chart issued',
      action: 'GIVE_DATES',
      actionLabel: 'Give dates',
      roles: ['RADIOGRAPHER'],
      to: 'B',
      toLabel: 'Treatment',
      requiresReason: false,
      requiresAssignment: false,
    },
  ],
  changes: [],
  ...change,
});

describe('WorkflowEditor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers to start a draft, and shows what the server says if it cannot', async () => {
    vi.mocked(startDraft).mockResolvedValue({ message: 'A draft is already being prepared.' });
    render(<StartDraft />);

    await userEvent.click(screen.getByRole('button', { name: 'Start a draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A draft is already being prepared.');
  });

  it('shows each stage and step with who may do it, and Saturday updates only where they exist', () => {
    render(<WorkflowEditor draft={draft()} />);

    expect(screen.getByRole('textbox', { name: 'Stage 1' })).toHaveValue('Chart issued');
    expect(screen.getByRole('checkbox', { name: 'Radiographer may Give dates at Chart issued' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Consultant may Give dates at Chart issued' })).not.toBeChecked();
    // Only stage 2 has Saturday updates.
    expect(screen.getAllByText('Saturday update from')).toHaveLength(1);
  });

  it('says nothing has changed, and will not approve until something has', () => {
    const { rerender } = render(<WorkflowEditor draft={draft()} />);

    expect(screen.getByRole('status')).toHaveTextContent('Nothing yet.');
    expect(screen.getByRole('button', { name: 'Approve and use for new charts' })).toBeDisabled();

    rerender(<WorkflowEditor draft={draft({ changes: ['The stage "Treatment" is now called "Therapy".'] })} />);
    expect(screen.getByText('The stage "Treatment" is now called "Therapy".')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve and use for new charts' })).toBeEnabled();
  });

  it('puts each refusal beside the field it names', async () => {
    vi.mocked(saveDraft).mockResolvedValue({
      message: 'Some fields need attention.',
      fieldErrors: {
        'stages.0.label': ['Enter a name up to 80 characters.'],
        'steps.0.roles': ['Choose at least one role.'],
        label: ['Enter a name up to 120 characters.'],
      },
    });
    render(<WorkflowEditor draft={draft()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Save changes to the draft' }));

    expect(await screen.findByText('Enter a name up to 80 characters.')).toBeInTheDocument();
    expect(screen.getByText('Choose at least one role.')).toBeInTheDocument();
    expect(screen.getByText('Enter a name up to 120 characters.')).toBeInTheDocument();
  });

  it('sends every field on the form when saving', async () => {
    vi.mocked(saveDraft).mockResolvedValue({ done: 'Saved.' });
    render(<WorkflowEditor draft={draft()} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Senior resident may Give dates at Chart issued' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes to the draft' }));

    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    const data = vi.mocked(saveDraft).mock.calls[0]![1] as FormData;

    expect(data.get('label')).toBe('RT workflow');
    expect(data.get('stage:B')).toBe('Treatment');
    expect(data.getAll('step:A|GIVE_DATES')).toEqual(['SENIOR_RESIDENT', 'RADIOGRAPHER']);
    expect(data.getAll('weekly:B')).toEqual(['JUNIOR_RESIDENT']);
  });

  it('approves and discards through their own buttons', async () => {
    vi.mocked(discardDraft).mockResolvedValue({ done: 'Draft discarded.' });
    vi.mocked(approveDraft).mockResolvedValue({ message: 'Nothing to approve.' });
    render(<WorkflowEditor draft={draft({ changes: ['x'] })} />);

    await userEvent.click(screen.getByRole('button', { name: 'Discard the draft' }));
    expect(await screen.findByText('Draft discarded.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Approve and use for new charts' }));
    expect(await screen.findByText('Nothing to approve.')).toBeInTheDocument();
  });
});
