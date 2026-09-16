import AdminLogin from "../login/page"

/**
 * Admin accounts are not created here: an ordinary account is granted an admin
 * role by a platform admin. As a zone, next.config.ts forwards /admin/register
 * to the shell; on its own host this shows the sign-in explanation instead of
 * redirecting to itself.
 */
export default function AdminRegister() {
  return <AdminLogin />
}
