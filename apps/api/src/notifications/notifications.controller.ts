import { Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import type { NotificationList } from '@oncotrack/contracts';
import { type Actor, CurrentActor } from '../auth/actor.js';
import { NotificationService } from './notification.service.js';

@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(NotificationService) private readonly notifications: NotificationService) {}

  /** The signed-in person's inbox, newest first, with how many are unread. */
  @Get()
  list(@CurrentActor() actor: Actor, @Query('limit') limit?: string): Promise<NotificationList> {
    const parsed = Number(limit);
    return this.notifications.list(actor, Number.isInteger(parsed) && parsed > 0 ? parsed : 50);
  }

  /** Just the unread count, for the bell in the header. */
  @Get('unread-count')
  async unreadCount(@CurrentActor() actor: Actor): Promise<{ unread: number }> {
    return { unread: await this.notifications.unread(actor) };
  }

  @Post('read-all')
  @HttpCode(200)
  async readAll(@CurrentActor() actor: Actor): Promise<{ marked: number }> {
    return { marked: await this.notifications.markAllRead(actor) };
  }

  @Post(':id/read')
  @HttpCode(200)
  async read(@CurrentActor() actor: Actor, @Param('id') id: string): Promise<{ ok: true }> {
    await this.notifications.markRead(actor, id);
    return { ok: true };
  }
}
