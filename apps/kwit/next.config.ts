import { createZoneConfig } from "@atpost/config/next"

const base = createZoneConfig({ basePath: "/kwit" })

/**
 * The Know It zone — questions and answers (qa-service behind `/v1/qa`).
 *
 * `createZoneConfig` maps `/v1/:path*` onto this zone's own proxy; with the
 * basePath that rule matches `/kwit/v1/*`, which is what the api-client asks
 * for because its baseURL is the basePath (NEXT_PUBLIC_API_BASE_URL=/kwit).
 *
 * @momentum/content and @momentum/interactions ship source TSX, so they are
 * transpiled here like apps/tube does.
 */
const nextConfig = {
  ...base,
  transpilePackages: [
    ...(base.transpilePackages ?? []),
    "@momentum/chrome",
    "@momentum/content",
    "@momentum/interactions",
    "@momentum/player",
  ],
}

export default nextConfig
