'use server';

import { revalidatePath } from 'next/cache';

import NotificationService from '@/services/api/notification.service';

/** For the bell in the header, which asks every so often. */
export async function getUnreadCount(): Promise<number> {
  return NotificationService.unreadCount();
}

/** Marks one notification read (from a form, so it works without JavaScript too). */
export async function markRead(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');

  if (id) await NotificationService.markRead(id);

  revalidatePath('/notifications');
}

export async function markAllRead(): Promise<void> {
  await NotificationService.markAllRead();

  revalidatePath('/notifications');
}
