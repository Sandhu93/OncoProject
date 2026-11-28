import { beforeEach, describe, expect, it, vi } from 'vitest';

import NotificationService from '@/services/api/notification.service';

import { getUnreadCount, markAllRead, markRead } from './actions';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/services/api/notification.service', () => ({
  default: { unreadCount: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() },
}));

describe('notification actions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the unread count', async () => {
    vi.mocked(NotificationService.unreadCount).mockResolvedValue(3);

    await expect(getUnreadCount()).resolves.toBe(3);
  });

  it('marks the notification named in the form, and nothing when none is named', async () => {
    const form = new FormData();

    form.set('id', 'abc');
    await markRead(form);
    await markRead(new FormData());

    expect(NotificationService.markRead).toHaveBeenCalledTimes(1);
    expect(NotificationService.markRead).toHaveBeenCalledWith('abc');
  });

  it('marks everything read', async () => {
    await markAllRead();

    expect(NotificationService.markAllRead).toHaveBeenCalledTimes(1);
  });
});
