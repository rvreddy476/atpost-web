import { redirect } from "next/navigation"

/**
 * Admin accounts are not created here: an ordinary account is granted an admin
 * role by a platform admin, then signs in on this host.
 */
export default function AdminRegister() {
  redirect("/login")
}
