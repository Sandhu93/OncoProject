import 'server-only';

import {
  type AuditList,
  CLINICAL_ROLES,
  type CreateStaffRequest,
  STAFF_CAPABILITIES,
  type StaffMember,
  type UpdateStaffRequest,
  type WorkflowView,
} from '@oncotrack/contracts';
import { z } from 'zod';

import { handleRequest } from './base.service';

const StaffMemberSchema = z.object({
  id: z.string(),
  username: z.string(),
  fullName: z.string(),
  roles: z.array(z.enum(CLINICAL_ROLES)),
  capabilities: z.array(z.enum(STAFF_CAPABILITIES)),
  isActive: z.boolean(),
  isAvailable: z.boolean(),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
  canDelete: z.boolean(),
});

const WorkflowSchema = z.object({
  workflow: z
    .object({
      code: z.string(),
      version: z.number(),
      label: z.string(),
      status: z.literal('ACTIVE'),
      approvedBy: z.string().nullable(),
      approvedAt: z.string().nullable(),
      stages: z.array(
        z.object({
          code: z.string(),
          label: z.string(),
          phase: z.string().nullable(),
          position: z.number(),
          isInitial: z.boolean(),
          isTerminal: z.boolean(),
          weeklyUpdateRoles: z.array(z.enum(CLINICAL_ROLES)),
        }),
      ),
      transitions: z.array(
        z.object({
          from: z.string(),
          fromLabel: z.string(),
          action: z.string(),
          actionLabel: z.string(),
          role: z.enum(CLINICAL_ROLES),
          to: z.string(),
          toLabel: z.string(),
          requiresReason: z.boolean(),
          requiresAssignment: z.boolean(),
        }),
      ),
    })
    .nullable(),
});

const AuditListSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      occurredAt: z.string(),
      action: z.string(),
      entityType: z.string(),
      entityId: z.string(),
      rtNumber: z.string().nullable(),
      actorName: z.string().nullable(),
      actorRoles: z.array(z.string()),
      before: z.unknown(),
      after: z.unknown(),
    }),
  ),
  total: z.number(),
  actions: z.array(z.string()),
});

export interface AuditQuery {
  rt?: string;
  action?: string;
  person?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

/** Staff accounts, the workflow in use and the audit trail. The API checks who may use each. */
export default class AdminService {
  static staff = async () =>
    (
      await handleRequest<{ items: StaffMember[] }>('/admin/staff', {
        requiresAuth: true,
        parse: data => z.object({ items: z.array(StaffMemberSchema) }).parse(data),
      })
    ).items;

  static createStaff = (payload: CreateStaffRequest, idempotencyKey: string) =>
    handleRequest<StaffMember>('/admin/staff', {
      requiresAuth: true,
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload),
      parse: data => StaffMemberSchema.parse(data),
    });

  static updateStaff = (id: string, payload: UpdateStaffRequest, idempotencyKey: string) =>
    handleRequest<StaffMember>(`/admin/staff/${encodeURIComponent(id)}`, {
      requiresAuth: true,
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload),
      parse: data => StaffMemberSchema.parse(data),
    });

  static setPassword = (id: string, password: string, idempotencyKey: string) =>
    handleRequest<StaffMember>(`/admin/staff/${encodeURIComponent(id)}/password`, {
      requiresAuth: true,
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ password }),
      parse: data => StaffMemberSchema.parse(data),
    });

  static deleteStaff = (id: string, idempotencyKey: string) =>
    handleRequest<StaffMember>(`/admin/staff/${encodeURIComponent(id)}`, {
      requiresAuth: true,
      method: 'DELETE',
      headers: { 'Idempotency-Key': idempotencyKey },
      parse: data => StaffMemberSchema.parse(data),
    });

  /** The workflow the department is running, or null when none has been approved yet. */
  static workflow = async (): Promise<WorkflowView | null> =>
    (
      await handleRequest<{ workflow: WorkflowView | null }>('/admin/workflow', {
        requiresAuth: true,
        parse: data => WorkflowSchema.parse(data),
      })
    ).workflow;

  static audit = (query: AuditQuery) =>
    handleRequest<AuditList>('/admin/audit', {
      requiresAuth: true,
      query: { ...query },
      parse: data => AuditListSchema.parse(data) as AuditList,
    });
}
