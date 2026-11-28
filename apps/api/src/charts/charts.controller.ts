import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Res } from '@nestjs/common';
import type { ChartDetail, ChartList, ChartQueue, ChartSummary } from '@oncotrack/contracts';
import { CurrentActor, type Actor } from '../auth/actor.js';
import { ChartActionsService } from './chart-actions.service.js';
import { ChartsService, type ListFilters } from './charts.service.js';
import { CommentsService } from './comments.service.js';
import { QueueService } from './queue.service.js';

interface ResponseLike {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
}

@Controller('charts')
export class ChartsController {
  constructor(
    @Inject(ChartsService) private readonly charts: ChartsService,
    @Inject(ChartActionsService) private readonly actions: ChartActionsService,
    @Inject(QueueService) private readonly queue: QueueService,
    @Inject(CommentsService) private readonly comments: CommentsService,
  ) {}

  @Post()
  async issue(
    @CurrentActor() actor: Actor,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<ChartSummary> {
    const result = await this.charts.issue(actor, key, body);
    response.status(result.status);
    if (result.replayed) response.setHeader('Idempotent-Replayed', 'true');
    return result.body as ChartSummary;
  }

  @Get()
  list(@Query() query: ListFilters): Promise<ChartList> {
    return this.charts.list(query);
  }

  /** Every open chart, marked with what needs the signed-in person. Declared before `:rtNumber` routes. */
  @Get('queue')
  queueFor(@CurrentActor() actor: Actor): Promise<ChartQueue> {
    return this.queue.queue(actor);
  }

  @Get('by-number/:rtNumber')
  find(@CurrentActor() actor: Actor, @Param('rtNumber') rtNumber: string): Promise<ChartDetail> {
    return this.actions.view(actor, rtNumber);
  }

  /** Records one step of the workflow. Send `{ expectedVersion, values }` and an Idempotency-Key header. */
  @Post('by-number/:rtNumber/actions/:action')
  async perform(
    @CurrentActor() actor: Actor,
    @Param('rtNumber') rtNumber: string,
    @Param('action') action: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<ChartDetail> {
    const result = await this.actions.perform(actor, key, rtNumber, action, body);
    response.status(result.status);
    if (result.replayed) response.setHeader('Idempotent-Replayed', 'true');
    return result.body;
  }

  /** Adds a comment to the chart's discussion. Send `{ body, forRole? }` and an Idempotency-Key header. */
  @Post('by-number/:rtNumber/comments')
  async comment(
    @CurrentActor() actor: Actor,
    @Param('rtNumber') rtNumber: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<ChartDetail> {
    const result = await this.comments.post(actor, key, rtNumber, body);
    response.status(result.status);
    if (result.replayed) response.setHeader('Idempotent-Replayed', 'true');
    return this.actions.view(actor, rtNumber);
  }
}
