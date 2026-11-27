import { redirect } from 'next/navigation';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { encodeRedirectPath } from '@/utils/redirect-path';

import { ApiError } from '@/services/api/api-errors';
import AuthService from '@/services/api/auth.service';
import { saveSession } from '@/services/app/session.service';

import { login } from './actions';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));
vi.mock('@/services/api/auth.service', () => ({ default: { login: vi.fn() } }));
vi.mock('@/services/app/session.service', () => ({ saveSession: vi.fn() }));

const form = (fields: Record<string, string>) => {
  const data = new FormData();

  for (const [key, value] of Object.entries(fields)) data.set(key, value);

  return data;
};

const valid = { username: 'synthetic.user', password: 'secret' };

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('login', () => {
  it('saves the token and goes to the dashboard', async () => {
    vi.mocked(AuthService.login).mockResolvedValue({ accessToken: 'abc' });

    await expect(login({}, form(valid))).rejects.toThrow('NEXT_REDIRECT');

    expect(AuthService.login).toHaveBeenCalledWith(valid);
    expect(saveSession).toHaveBeenCalledWith({ accessToken: 'abc' });
    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });

  it('returns to the page in the redirect field', async () => {
    vi.mocked(AuthService.login).mockResolvedValue({ accessToken: 'abc' });

    await expect(login({}, form({ ...valid, redirect: encodeRedirectPath('/reports?y=1')! }))).rejects.toThrow();

    expect(redirect).toHaveBeenCalledWith('/reports?y=1');
  });

  it('ignores a redirect to another site', async () => {
    vi.mocked(AuthService.login).mockResolvedValue({ accessToken: 'abc' });
    const crafted = Buffer.from('https://evil.example').toString('base64url');

    await expect(login({}, form({ ...valid, redirect: crafted }))).rejects.toThrow();

    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });

  it('validates the form before calling the API', async () => {
    const state = await login({}, form({ username: '   ', password: '' }));

    expect(state).toEqual({
      username: '   ',
      fieldErrors: { username: ['Enter your username.'], password: ['Enter your password.'] },
    });
    expect(AuthService.login).not.toHaveBeenCalled();
  });

  it('shows the API’s message and field errors for a rejected login', async () => {
    vi.mocked(AuthService.login).mockRejectedValue(
      new ApiError('Invalid username or password.', 401, { username: ['Unknown username.'] }),
    );

    expect(await login({}, form(valid))).toEqual({
      username: 'synthetic.user',
      message: 'Invalid username or password.',
      fieldErrors: { username: ['Unknown username.'] },
    });
    expect(saveSession).not.toHaveBeenCalled();
  });

  it.each([
    new ApiError('connect ECONNREFUSED 10.0.0.5:8000', 500),
    new ApiError('The API did not respond in time.', 504),
    new Error('unexpected'),
  ])('hides server-side details (%s)', async error => {
    vi.mocked(AuthService.login).mockRejectedValue(error);

    const state = await login({}, form(valid));

    expect(state.message).toBe('Login is unavailable right now. Please try again in a moment.');
    expect(console.error).toHaveBeenCalled();
  });

  it('never returns the password', async () => {
    vi.mocked(AuthService.login).mockRejectedValue(new ApiError('Wrong password.', 422));

    expect(JSON.stringify(await login({}, form(valid)))).not.toContain('secret');
  });
});
