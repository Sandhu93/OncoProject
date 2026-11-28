import 'server-only';

import type { NotificationList } from '@oncotrack/contracts';
import { z } from 'zod';

import { handleRequest } from './base.service';

const NotificationListSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      message: z.string(),
      rtNumber: z.string().nullable(),
      createdAt: z.string(),
      readAt: z.string().nullable(),
    }),
  ),
  unread: z.number(),
});

export default class NotificationService {
  /** The signed-in person's inbox, newest first. */
  static list = () =>
    handleRequest<NotificationList>('/notifications', {
      requiresAuth: true,
      parse: data => NotificationListSchema.parse(data),
    });

  /** Just how many are unread, for the bell. */
  static unreadCount = async () => {
    const { unread } = await handleRequest<{ unread: number }>('/notifications/unread-count', {
      requiresAuth: true,
      parse: data => z.object({ unread: z.number() }).parse(data),
    });

    return unread;
  };

  static markRead = (id: string) =>
    handleRequest<{ ok: true }>(`/notifications/${encodeURIComponent(id)}/read`, {
      requiresAuth: true,
      method: 'POST',
    });

  static markAllRead = () =>
    handleRequest<{ marked: number }>('/notifications/read-all', { requiresAuth: true, method: 'POST' });
}
