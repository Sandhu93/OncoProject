import type { ClinicalRole, StaffCapability } from '@oncotrack/contracts';

export const ROLE_LABELS: Record<ClinicalRole, string> = {
  JUNIOR_RESIDENT: 'Junior resident',
  SENIOR_RESIDENT: 'Senior resident',
  CONSULTANT: 'Consultant',
  PHYSICIST: 'Physicist',
  RADIOGRAPHER: 'Radiographer',
};

export const CAPABILITY_LABELS: Record<StaffCapability, string> = {
  MANAGE_STAFF: 'Manage staff',
  CONFIGURE_WORKFLOW: 'Configure workflow',
  VIEW_AUDIT: 'View audit trail',
  EXPORT_REPORTS: 'Export reports',
};
