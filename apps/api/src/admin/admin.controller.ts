import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { AuditList, StaffMember, WorkflowView } from '@oncotrack/contracts';
import { CurrentActor, type Actor } from '../auth/actor.js';
import { AuditService, type AuditQuery } from './audit.service.js';
import { StaffAdminService } from './staff-admin.service.js';
import { WorkflowViewService } from './workflow-view.service.js';

interface ResponseLike {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
}

@Controller('admin')
export class AdminController {
  constructor(
    @Inject(StaffAdminService) private readonly staff: StaffAdminService,
    @Inject(WorkflowViewService) private readonly workflow: WorkflowViewService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get('staff')
  async listStaff(@CurrentActor() actor: Actor): Promise<{ items: StaffMember[] }> {
    return { items: await this.staff.list(actor) };
  }

  @Post('staff')
  async createStaff(
    @CurrentActor() actor: Actor,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<StaffMember> {
    return this.reply(response, await this.staff.create(actor, key, body));
  }

  @Post('staff/:id')
  async updateStaff(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<StaffMember> {
    return this.reply(response, await this.staff.update(actor, key, id, body));
  }

  @Post('staff/:id/password')
  async setPassword(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<StaffMember> {
    return this.reply(response, await this.staff.setPassword(actor, key, id, body));
  }

  @Delete('staff/:id')
  async deleteStaff(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<StaffMember> {
    return this.reply(response, await this.staff.remove(actor, key, id));
  }

  /** The workflow in use. Any signed-in person may read it. */
  @Get('workflow')
  activeWorkflow(): Promise<{ workflow: WorkflowView | null }> {
    return this.workflow.active();
  }

  @Get('audit')
  auditTrail(@CurrentActor() actor: Actor, @Query() query: AuditQuery): Promise<AuditList> {
    return this.audit.list(actor, query);
  }

  private reply<T>(
    response: ResponseLike,
    result: { status: number; body: T; replayed: boolean },
  ): T {
    response.status(result.status);
    if (result.replayed) response.setHeader('Idempotent-Replayed', 'true');
    return result.body;
  }
}
