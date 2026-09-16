import { ProductMark } from "@/components/shell/TopBar"
import { SignInLink } from "@/components/shell/AdminShell"

/**
 * As a zone (/admin), next.config.ts redirects /admin/login to the shell's one
 * sign-in page before this renders. On its own host that redirect would loop,
 * so this page points at NEXT_PUBLIC_ADMIN_SIGN_IN_URL instead, or says that
 * none is configured. AdminShell renders it without the console chrome.
 */
export default function AdminLogin() {
  return (
    <div className="min-h-screen">
      <div className="border-b border-mo px-4 py-3">
        <ProductMark />
      </div>
      <main className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="font-mo-display text-2xl font-semibold text-mo-ink">Sign in to the admin console</h1>
        <p className="mt-3 text-sm text-mo-body">
          Use your admin account. You will be asked for a code from your authenticator app.
        </p>
        <SignInLink />
      </main>
    </div>
  )
}
