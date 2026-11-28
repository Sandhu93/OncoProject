import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { readConfig } from '../config.js';
import { NotificationService } from './notification.service.js';

/** Runs the reminder sweep (stalled charts, Saturday updates) on a timer: a minute after start, then regularly. */
@Injectable()
export class NotificationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(NotificationScheduler.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(@Inject(NotificationService) private readonly notifications: NotificationService) {}

  onModuleInit(): void {
    const { sweepMinutes } = readConfig();
    if (sweepMinutes === 0) return;
    const run = () =>
      this.notifications.sweep().catch((error: unknown) => {
        this.log.error(
          `Reminder sweep failed: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      });
    this.timers = [setTimeout(run, 60_000), setInterval(run, sweepMinutes * 60_000)];
    for (const timer of this.timers) timer.unref();
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }
}
