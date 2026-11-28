import type { AvailableAction } from '@oncotrack/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { performAction } from '@/app/charts/[rtNumber]/actions';

import ActionForm from './ActionForm';

vi.mock('@/app/charts/[rtNumber]/actions', () => ({ performAction: vi.fn() }));

const action: AvailableAction = {
  action: 'DEMO',
  label: 'Record the demo',
  requiresReason: false,
  checks: [{ label: 'Plan approved', ok: false, detail: 'The plan is not approved yet.' }],
  fields: [
    { key: 'part', label: 'Part one', type: 'heading', required: false },
    { key: 'when', label: 'When', type: 'date', required: true, min: '2026-12-01', default: '2026-12-02' },
    { key: 'at', label: 'At', type: 'time', required: true, default: '10:00' },
    {
      key: 'machine',
      label: 'Machine',
      type: 'select',
      required: true,
      options: [
        { value: 'L1', label: 'LINAC 1' },
        { value: 'L2', label: 'LINAC 2' },
      ],
      default: 'L2',
    },
    { key: 'who', label: 'Who', type: 'staff', required: false, options: [] },
    { key: 'count', label: 'Count', type: 'number', required: true },
    { key: 'note', label: 'Note', type: 'area', required: false, help: 'Keep it short.', maxLength: 200 },
    { key: 'ref', label: 'Reference', type: 'text', required: false, maxLength: 30 },
  ],
};

describe('ActionForm', () => {
  it('draws each field from the API description, with its default, limits and hint', () => {
    render(<ActionForm rtNumber="RT-1" version={4} action={action} />);

    expect(screen.getByRole('form', { name: 'Record the demo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Part one' })).toBeInTheDocument();
    expect(screen.getByLabelText('When')).toHaveValue('2026-12-02');
    expect(screen.getByLabelText('When')).toHaveAttribute('min', '2026-12-01');
    expect(screen.getByLabelText('When')).toBeRequired();
    expect(screen.getByLabelText('At')).toHaveValue('10:00');
    expect(screen.getByLabelText('Machine')).toHaveValue('L2');
    expect(screen.getByRole('option', { name: 'LINAC 1' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Who/)).toHaveDisplayValue('—');
    expect(screen.getByLabelText('Count')).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByLabelText(/Note/)).not.toBeRequired();
    expect(screen.getByLabelText(/Note/)).toHaveAccessibleDescription('Keep it short.');
    expect(screen.getByLabelText(/Note/)).toHaveAttribute('maxlength', '200');
    expect(screen.getByLabelText(/Reference/)).toHaveAttribute('maxlength', '30');
  });

  it('shows what must be done first, and carries the chart and version in hidden fields', () => {
    const { container } = render(<ActionForm rtNumber="RT-1" version={4} action={action} />);

    expect(screen.getByRole('list', { name: 'Before you start' })).toHaveTextContent(
      'Plan approved: Not yet — The plan is not approved yet.',
    );
    expect(container.querySelector('input[name="rtNumber"]')).toHaveValue('RT-1');
    expect(container.querySelector('input[name="action"]')).toHaveValue('DEMO');
    expect(container.querySelector('input[name="expectedVersion"]')).toHaveValue('4');
  });

  it('submits through the server action', async () => {
    vi.mocked(performAction).mockResolvedValue({});
    render(<ActionForm rtNumber="RT-1" version={4} action={action} />);

    await userEvent.click(screen.getByRole('button', { name: 'Record the demo' }));

    expect(performAction).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(performAction).mock.calls[0]![1];

    expect(sent.get('when')).toBe('2026-12-02');
    expect(sent.get('expectedVersion')).toBe('4');
  });

  it('shows a refusal and a field error, and keeps what was typed', async () => {
    vi.mocked(performAction).mockResolvedValue({
      message: 'Some fields need attention.',
      fieldErrors: { count: ['Enter a whole number.'] },
      values: { count: 'abc', note: 'kept' },
    });
    render(<ActionForm rtNumber="RT-1" version={4} action={action} />);

    await userEvent.click(screen.getByRole('button', { name: 'Record the demo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Some fields need attention.');
    expect(screen.getByLabelText('Count')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Count')).toHaveAccessibleDescription('Enter a whole number.');
    expect(screen.getByLabelText('Count')).toHaveValue('abc');
    expect(screen.getByLabelText(/Note/)).toHaveValue('kept');
  });

  it('names the button "Send back" for a step that returns the chart, and asks for the reason', () => {
    render(
      <ActionForm
        rtNumber="RT-1"
        version={2}
        action={{
          action: 'RETURN_CONTOURING',
          label: 'Send back to junior resident',
          requiresReason: true,
          checks: [],
          fields: [{ key: 'reason', label: 'Why is it going back?', type: 'area', required: true }],
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Send back' })).toBeInTheDocument();
    expect(screen.getByLabelText('Why is it going back?')).toBeRequired();
  });

  it('lists the people to choose from in a staff field', () => {
    render(
      <ActionForm
        rtNumber="RT-1"
        version={2}
        action={{
          action: 'ASSIGN_CONTOURING',
          label: 'Assign a junior resident',
          requiresReason: false,
          checks: [],
          fields: [
            {
              key: 'resident',
              label: 'Junior resident',
              type: 'staff',
              required: true,
              staffRole: 'JUNIOR_RESIDENT',
              default: 'b',
              options: [
                { value: 'a', label: 'Resident Anand' },
                { value: 'b', label: 'Resident Bina' },
              ],
            },
          ],
        }}
      />,
    );

    expect(screen.getByLabelText('Junior resident', { selector: 'select' })).toHaveValue('b');
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual([
      'Resident Anand',
      'Resident Bina',
    ]);
  });
});
