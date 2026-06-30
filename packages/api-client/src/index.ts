// @atpost/api-client — the shared gateway client.
//
//   import api, { getCurrentUserId } from "@atpost/api-client"
//
// `api` is the axios instance (auth header, CSRF, 401→refresh retry) every app
// uses to call the gateway via the same-origin /api/proxy. Server route handlers
// for the proxy + token refresh ship as subpath exports so each app wires them
// with one line:
//
//   // app/api/proxy/[...path]/route.ts
//   export { GET, POST, PUT, DELETE, PATCH } from "@atpost/api-client/proxy"
//   // app/api/auth/refresh/route.ts
//   export { POST } from "@atpost/api-client/refresh"
export { default, getCurrentUserId, saveSession, clearSession } from "./client"
