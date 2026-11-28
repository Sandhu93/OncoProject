import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getUnreadCount } from '@/app/notifications/actions';

import NotificationBell from './NotificationBell';

vi.mock('@/app/notifications/actions', () => ({ getUnreadCount: vi.fn() }));

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('links to the inbox with no badge when nothing is unread', async () => {
    vi.mocked(getUnreadCount).mockResolvedValue(0);
    render(<NotificationBell />);
    await act(async () => undefined);

    expect(screen.getByRole('link', { name: 'Inbox' })).toHaveAttribute('href', '/notifications');
    expect(screen.queryByLabelText(/unread/)).toBeNull();
  });

  it('shows how many are unread and asks again later', async () => {
    vi.mocked(getUnreadCount).mockResolvedValueOnce(2).mockResolvedValue(5);
    render(<NotificationBell pollMs={1000} />);
    await act(async () => undefined);

    expect(screen.getByLabelText('2 unread')).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(screen.getByLabelText('5 unread')).toBeVisible();
  });

  it('keeps working when the count cannot be read', async () => {
    vi.mocked(getUnreadCount).mockRejectedValue(new Error('offline'));
    render(<NotificationBell />);
    await act(async () => undefined);

    expect(screen.getByRole('link', { name: 'Inbox' })).toBeVisible();
  });

  it('marks the inbox as the current page', async () => {
    vi.mocked(getUnreadCount).mockResolvedValue(0);
    render(<NotificationBell current />);
    await act(async () => undefined);

    expect(screen.getByRole('link', { name: 'Inbox' })).toHaveAttribute('aria-current', 'page');
  });
});
