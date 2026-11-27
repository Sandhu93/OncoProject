import { redirect } from 'next/navigation';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/services/api/api-errors';
import ChartService from '@/services/api/chart.service';

import { issueChart } from './actions';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));
vi.mock('@/services/api/chart.service', () => ({ default: { issue: vi.fn() } }));

const form = (fields: Record<string, string>) => {
  const data = new FormData();

  for (const [key, value] of Object.entries(fields)) data.set(key, value);

  return data;
};

const valid = {
  rtNumber: 'rt/2026/001',
  plannedSessions: '25',
  priority: 'ROUTINE',
  planId: '',
  contourSetName: '',
  scanReference: '',
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('issueChart', () => {
  it('issues the chart and opens it by RT number', async () => {
    vi.mocked(ChartService.issue).mockResolvedValue({ rtNumber: 'RT/2026/001' } as never);

    await expect(issueChart({}, form(valid))).rejects.toThrow('NEXT_REDIRECT');

    expect(ChartService.issue).toHaveBeenCalledWith(
      { rtNumber: 'rt/2026/001', plannedSessions: 25, priority: 'ROUTINE' },
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    expect(redirect).toHaveBeenCalledWith('/charts/RT%2F2026%2F001');
  });

  it('sends the optional references only when they are filled in, trimmed', async () => {
    vi.mocked(ChartService.issue).mockResolvedValue({ rtNumber: 'RT-1' } as never);

    await expect(
      issueChart({}, form({ ...valid, planId: '  PLAN-7 ', scanReference: 'CT-3', priority: 'URGENT' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(vi.mocked(ChartService.issue).mock.calls[0]![0]).toEqual({
      rtNumber: 'rt/2026/001',
      plannedSessions: 25,
      priority: 'URGENT',
      planId: 'PLAN-7',
      scanReference: 'CT-3',
    });
  });

  it('uses a new key for every submission', async () => {
    vi.mocked(ChartService.issue).mockResolvedValue({ rtNumber: 'RT-1' } as never);

    await expect(issueChart({}, form(valid))).rejects.toThrow();
    await expect(issueChart({}, form(valid))).rejects.toThrow();

    const [first, second] = vi.mocked(ChartService.issue).mock.calls.map(call => call[1]);

    expect(first).not.toBe(second);
  });

  it.each([
    [{ rtNumber: '  ' }, 'rtNumber', 'Enter the RT number.'],
    [{ plannedSessions: '0' }, 'plannedSessions', 'Enter a whole number from 1 to 100.'],
    [{ plannedSessions: '101' }, 'plannedSessions', 'Enter a whole number from 1 to 100.'],
    [{ plannedSessions: '2.5' }, 'plannedSessions', 'Enter a whole number from 1 to 100.'],
    [{ plannedSessions: '' }, 'plannedSessions', 'Enter a whole number from 1 to 100.'],
    [{ priority: 'SOON' }, 'priority', 'Choose Routine or Urgent.'],
    [{ planId: 'x'.repeat(61) }, 'planId', 'Use at most 60 characters.'],
  ])('refuses %j without calling the API', async (change, field, message) => {
    const state = await issueChart({}, form({ ...valid, ...change }));

    expect(state.fieldErrors?.[field as keyof typeof state.fieldErrors]).toEqual([message]);
    expect(state.values).toMatchObject({ ...valid, ...change });
    expect(ChartService.issue).not.toHaveBeenCalled();
  });

  it('puts a duplicate RT number on its field and keeps what was typed', async () => {
    vi.mocked(ChartService.issue).mockRejectedValue(new ApiError('exists', 409, undefined, 'RT_NUMBER_EXISTS'));

    const state = await issueChart({}, form(valid));

    expect(state.fieldErrors?.rtNumber).toEqual(['A chart with this RT number already exists.']);
    expect(state.values?.rtNumber).toBe('rt/2026/001');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('explains that no workflow is active', async () => {
    vi.mocked(ChartService.issue).mockRejectedValue(new ApiError('raw', 409, undefined, 'WORKFLOW_NOT_ACTIVE'));

    expect((await issueChart({}, form(valid))).message).toMatch(/No workflow is active yet/);
  });

  it('shows a refusal for a role that may not issue charts', async () => {
    vi.mocked(ChartService.issue).mockRejectedValue(new ApiError('raw', 403, undefined, 'ROLE_NOT_ALLOWED'));

    expect((await issueChart({}, form(valid))).message).toBe('Only a consultant can issue a chart.');
  });

  it("shows the API's field problems on the fields", async () => {
    vi.mocked(ChartService.issue).mockRejectedValue(
      new ApiError(
        'Some fields need attention.',
        400,
        [{ field: 'rtNumber', message: 'Use up to 40 letters.' }],
        'VALIDATION_FAILED',
      ),
    );

    const state = await issueChart({}, form(valid));

    expect(state.message).toBe('Some fields need attention.');
    expect(state.fieldErrors).toEqual({ rtNumber: ['Use up to 40 letters.'] });
  });

  it('logs a server problem and shows a plain message', async () => {
    vi.mocked(ChartService.issue).mockRejectedValue(new ApiError('boom', 500));

    expect((await issueChart({}, form(valid))).message).toMatch(/could not be issued right now/);
    expect(console.error).toHaveBeenCalled();
  });
});
