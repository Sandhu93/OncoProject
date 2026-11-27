import { redirect } from 'next/navigation';

import { AFTER_LOGIN_ROUTE } from '@/constants/routes';

/** There is no public home page: logged-in staff go to the dashboard, everyone else to login (via proxy.ts). */
export default function Home() {
  redirect(AFTER_LOGIN_ROUTE);
}
