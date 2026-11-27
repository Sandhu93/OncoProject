import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { issueChart } from '@/app/charts/new/actions';

import IssueChartForm from './IssueChartForm';

vi.mock('@/app/charts/new/actions', () => ({ issueChart: vi.fn() }));

describe('IssueChartForm', () => {
  it('has labelled fields and marks the optional ones', () => {
    render(<IssueChartForm />);

    expect(screen.getByLabelText('RT number')).toBeRequired();
    expect(screen.getByLabelText('Planned sessions')).toBeRequired();
    expect(screen.getByLabelText('Priority')).toHaveValue('ROUTINE');
    expect(screen.getByLabelText(/Plan ID/)).not.toBeRequired();
    expect(screen.getByLabelText(/Contour set name/)).not.toBeRequired();
    expect(screen.getByLabelText(/Scan reference/)).not.toBeRequired();
  });

  it('warns on each reference field that patient names and clinical details do not belong there', () => {
    render(<IssueChartForm />);

    for (const label of [/Plan ID/, /Contour set name/, /Scan reference/]) {
      expect(screen.getByLabelText(label)).toHaveAccessibleDescription(/Never a patient name or clinical detail/);
    }
  });

  it('shows what the action returned, links errors to fields and keeps the typed values', async () => {
    vi.mocked(issueChart).mockResolvedValue({
      message: 'No workflow is active yet.',
      fieldErrors: { rtNumber: ['A chart with this RT number already exists.'] },
      values: { rtNumber: 'RT-1', plannedSessions: '25', priority: 'URGENT' },
    });
    render(<IssueChartForm />);

    await userEvent.type(screen.getByLabelText('RT number'), 'RT-1');
    await userEvent.type(screen.getByLabelText('Planned sessions'), '25');
    await userEvent.click(screen.getByRole('button', { name: 'Issue chart' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No workflow is active yet.');
    expect(screen.getByLabelText('RT number')).toBeInvalid();
    expect(screen.getByLabelText('RT number')).toHaveAccessibleDescription(/already exists/);
    expect(screen.getByLabelText('RT number')).toHaveValue('RT-1');
    expect(screen.getByLabelText('Priority')).toHaveValue('URGENT');
  });
});
