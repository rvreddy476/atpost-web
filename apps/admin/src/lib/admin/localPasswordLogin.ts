/** Server-only local sign-in lane. This key must NEVER enter a browser bundle. */
export function localPasswordProxyOptions(url: string, path: string[], env: Record<string, string | undefined>, incomingHost?: string | null) {
  const key = env.ADMIN_LOCAL_PASSWORD_LOGIN_KEY
  // Next standalone constructs req.url with the Docker listen address, not
  // necessarily the browser host. This UI must remain loopback-bound; check
  // the actual incoming Host and reject malformed/non-local authorities.
  const authority = incomingHost ?? new URL(url).host
  let host: URL
  try { host = new URL(`http://${authority}`) } catch { return undefined }
  if (host.host !== authority.toLowerCase()) return undefined
  const hostname = host.hostname
  // Explicit development portal only; never accept arbitrary forwarded hosts.
  const developmentHost = env.ADMIN_DEV_PASSWORD_HOST === "admin.cleestudio.com" && hostname === env.ADMIN_DEV_PASSWORD_HOST && !host.port
  if (!key || key.length < 32 || !env.AUTH_SERVICE_URL ||
      (!["localhost", "127.0.0.1", "[::1]"].includes(hostname) && !developmentHost) ||
      path.join("/") !== "auth/admin-session/login") return undefined
  return { upstream: env.AUTH_SERVICE_URL, headers: new Headers({ "X-Admin-Local-Password-Key": key }) }
}
