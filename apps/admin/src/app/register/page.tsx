import { redirect } from 'next/navigation'

/**
 * There is one registration form on the platform and it lives in the shell, so
 * this route only exists to point at it — same as ../login/page.tsx, and same
 * as the commerce zone's pair.
 *
 * The zone config already declares a `/admin/register` redirect
 * (packages/config/next-config.mjs), but that one is built from AUTH_APP_URL
 * and quietly does nothing when the variable is unset — which is every local
 * run. Without this file that case is a 404 on a link the sign-in page itself
 * offers. Two mechanisms for one route is redundant only while both work.
 */
export default function LegacyAdminRegister() {
  redirect('/register?redirect=/admin')
}
