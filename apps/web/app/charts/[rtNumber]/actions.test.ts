import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/services/api/api-errors';
import ChartService from '@/services/api/chart.service';

import { performAction } from './actions';

vi.mock('server-only', () => ({}));
vi.mock('@/services/api/chart.service', () => ({ default: { perform: vi.fn() } }));
const redirect = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
);

vi.mock('next/navigation', () => ({ redirect }));

const form = (entries: Record<string, string>) => {
  const data = new FormData();

  for (const [key, value] of Object.entries(entries)) data.set(key, value);

  return data;
};

const submitted = { rtNumber: 'RT/1', action: 'GIVE_SIMULATION_DATES', expectedVersion: '3', mouldDate: '2030-01-02' };

describe('performAction', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('sends the values without the form bookkeeping, with a fresh key, then shows the chart again', async () => {
    vi.mocked(ChartService.perform).mockResolvedValue({} as never);

    await expect(performAction({}, form(submitted))).rejects.toThrow('NEXT_REDIRECT');
    await expect(performAction({}, form(submitted))).rejects.toThrow('NEXT_REDIRECT');

    const [first, second] = vi.mocked(ChartService.perform).mock.calls;

    expect(first!.slice(0, 3)).toEqual([
      'RT/1',
      'GIVE_SIMULATION_DATES',
      { expectedVersion: 3, values: { mouldDate: '2030-01-02' } },
    ]);
    expect(first![3]).not.toBe(second![3]);
    expect(redirect).toHaveBeenCalledWith('/charts/RT%2F1');
  });

  it.each([
    ['CHART_CHANGED', 'This chart changed while you were working'],
    ['CHART_CLOSED', 'This chart is closed'],
    ['NOT_ASSIGNED', 'Only the junior resident assigned'],
  ])('puts the API refusal %s in words and keeps the typed values', async (code, text) => {
    vi.mocked(ChartService.perform).mockRejectedValue(new ApiError('raw', 409, undefined, code));

    const result = await performAction({}, form(submitted));

    expect(result.message).toContain(text);
    expect(result.values).toEqual({ mouldDate: '2030-01-02' });
  });

  it('returns field errors for a refused value, and the API message for an unknown code', async () => {
    vi.mocked(ChartService.perform).mockRejectedValue(
      new ApiError(
        'Some fields need attention.',
        400,
        [{ field: 'mouldDate', message: 'Enter mould date.' }],
        'VALIDATION_FAILED',
      ),
    );

    expect(await performAction({}, form(submitted))).toMatchObject({
      message: 'Some fields need attention.',
      fieldErrors: { mouldDate: ['Enter mould date.'] },
    });
  });

  it('hides a server failure behind a calm message, and logs it', async () => {
    vi.mocked(ChartService.perform).mockRejectedValue(new ApiError('boom', 502));

    const result = await performAction({}, form(submitted));

    expect(result.message).toBe('The step could not be recorded right now. Please try again in a moment.');
    expect(console.error).toHaveBeenCalled();
  });

  it('refuses an incomplete form without calling the API', async () => {
    const result = await performAction({}, form({ rtNumber: 'RT-1' }));

    expect(result.message).toContain('incomplete');
    expect(ChartService.perform).not.toHaveBeenCalled();
  });
});
