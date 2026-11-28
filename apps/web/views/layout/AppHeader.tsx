import type { StaffCapability } from '@oncotrack/contracts';

import NotificationBell from './NotificationBell';
import SiteMenu, { type MenuLink } from './SiteMenu';

export type NavKey =
  | 'dashboard'
  | 'overview'
  | 'calendar'
  | 'saturday'
  | 'stages'
  | 'charts'
  | 'workflow'
  | 'staff'
  | 'audit'
  | 'reports'
  | 'notifications';

interface AppHeaderProps {
  /** The page the user is on, so its link can be marked as current. */
  current: NavKey;
  fullName: string;
  /** What the person may do beyond their role. Staff, Reports and Audit show only to those who hold them. */
  capabilities?: readonly StaffCapability[];
}

interface NavItem {
  key: NavKey;
  href: string;
  label: string;
  needs?: StaffCapability;
}

/** The links people use every day: in the bar on a wide screen. */
const PRIMARY: readonly NavItem[] = [
  { key: 'dashboard', href: '/dashboard', label: 'Home' },
  { key: 'charts', href: '/charts', label: 'Charts' },
  { key: 'calendar', href: '/calendar', label: 'Calendar' },
  { key: 'saturday', href: '/saturday', label: 'Saturday updates' },
  { key: 'reports', href: '/reports', label: 'Reports', needs: 'EXPORT_REPORTS' },
];

/** Less common pages: under the account button on a wide screen. */
const MORE: readonly NavItem[] = [
  { key: 'overview', href: '/overview', label: 'Overview' },
  { key: 'stages', href: '/stages', label: 'Stages' },
  { key: 'workflow', href: '/workflow', label: 'Workflow' },
  { key: 'staff', href: '/staff', label: 'Staff', needs: 'MANAGE_STAFF' },
  { key: 'audit', href: '/audit', label: 'Audit trail', needs: 'VIEW_AUDIT' },
];

/** Navigation for every signed-in page: links in the bar when there is room, a menu button when there is not. */
export default function AppHeader({ current, fullName, capabilities = [] }: AppHeaderProps) {
  const allowed = (item: NavItem) => !item.needs || capabilities.includes(item.needs);
  const toLink = (item: NavItem): MenuLink => ({ href: item.href, label: item.label, current: current === item.key });

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <header className="border-b border-line bg-surface">
        <SiteMenu
          fullName={fullName}
          primary={PRIMARY.filter(allowed).map(toLink)}
          more={MORE.filter(allowed).map(toLink)}
          bell={<NotificationBell current={current === 'notifications'} />}
        />
      </header>
    </>
  );
}
