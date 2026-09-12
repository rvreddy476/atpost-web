/**
 * What a seller reads when a route is behind the commerce P0 fence.
 *
 * commerce-service answers 404 NOT_FOUND, before routing, for every family in
 * internal/http/handler_p0.go FencedPrefixes; as of 2026-09-12 that is the
 * returns inbox, return approve / reject, the earnings JSON and the payout
 * preview. An empty list and a switched-off feature are different facts, and
 * telling a seller "no returns yet" when the server refused to answer would
 * be a lie that costs them a dispute. So the page says which it is.
 */
export function FencedNotice({ feature }: { feature: string }) {
  return (
    <div className="notice notice-info" role="status">
      <strong className="text-shop-ink">{feature} is not switched on for MSeller on this server yet.</strong>
      <span className="block mt-1">
        The platform currently answers &ldquo;not found&rdquo; for this section; it is outside the launch scope,
        not a problem with your store. It will appear here the day it is enabled.
      </span>
    </div>
  )
}
