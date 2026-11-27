import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Res } from '@nestjs/common';
import type { ChartDetail, ChartList, ChartSummary } from '@oncotrack/contracts';
import { CurrentActor, type Actor } from '../auth/actor.js';
import { ChartsService, type ListFilters } from './charts.service.js';

interface ResponseLike {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
}

@Controller('charts')
export class ChartsController {
  constructor(@Inject(ChartsService) private readonly charts: ChartsService) {}

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

  @Get('by-number/:rtNumber')
  find(@Param('rtNumber') rtNumber: string): Promise<ChartDetail> {
    return this.charts.findByNumber(rtNumber);
  }
}
