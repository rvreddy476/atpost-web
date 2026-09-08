// @atpost/api-client — the shared gateway client.
//
//   import api, { markSignedIn, signOut } from "@atpost/api-client"
//
// `api` is the axios instance every app uses to call the gateway via the
// same-origin /api/proxy. It carries the session as COOKIES, not as a header:
// see the long note at the top of ./client for why, and for what that means
// for CSRF. It holds no credential and cannot tell anyone who is signed in.
//
// "Who is signed in" is a React question with a first-paint problem, so it
// lives one subpath along:
//
//   import { SessionProvider, useSession } from "@atpost/api-client/session"
//   import { readServerSession } from "@atpost/api-client/server"   // layouts
//
// Both are subpaths rather than barrel exports for the same reason
// `capabilities` is: the barrel stays importable by a zone with no React data
// layer, and `./server` imports next/headers, which throws anywhere but a
// server component.
//
// Server route handlers for the proxy + token refresh ship as subpath exports
// so each app wires them with one line:
//
//   // app/api/proxy/[...path]/route.ts
//   export { GET, POST, PUT, DELETE, PATCH } from "@atpost/api-client/proxy"
//   // app/api/auth/refresh/route.ts
//   export { POST } from "@atpost/api-client/refresh"
export {
  default,
  SESSION_CHANGE_EVENT,
  clearSession,
  hasSessionCookie,
  markSignedIn,
  notifySessionChanged,
  signOut,
} from "./client"
