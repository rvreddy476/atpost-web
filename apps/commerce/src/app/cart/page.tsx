// `/cart` is the route this zone shipped with and the one older links and
// bookmarks still point at. The bag lives at `/bag` now, because the word
// the shop uses is "bag" and a route label is a word too; this keeps the old
// address working by rendering the same page rather than by redirecting,
// which under a basePath is the one form of "keep it working" that cannot
// send someone to the wrong origin.
export { default } from "../bag/page"
