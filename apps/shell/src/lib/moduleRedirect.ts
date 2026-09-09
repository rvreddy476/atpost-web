/**
 * The zones that exist.
 *
 * This list carried ten entries, six of which named zones that have since been
 * deleted — /match, /community, /creator, /messenger, /live and /memories. An
 * allowlist is only worth having if everything on it is real: each dead entry
 * was a `?redirect=` this page would accept, sign someone in for, and then
 * hand them a 404. When a zone comes back it comes back here and in the
 * shell's `zones` rewrite table together, or the two drift again.
 */
const moduleHomes = ['/shop', '/admin', '/social', '/apps', '/reels', '/tube'] as const

export type ModuleHome = (typeof moduleHomes)[number]

/**
 * Where a visitor lands when nothing else was asked for. Always the shop.
 *
 * Never the module the account happens to hold the most power in. An
 * administrator who opens /login and signs in arrives as a customer and has to
 * walk to /admin deliberately to be an administrator again; the console is not
 * handed to them on the session's first paint because of who they are.
 *
 * This function has never been told a role, and still is not. That is the
 * point, not an oversight.
 */
export const DEFAULT_LANDING: ModuleHome = '/shop'

/**
 * The module a `?redirect=` actually names, or null when it names nothing this
 * shell is willing to send someone to.
 *
 * The three guards below are the whole security surface of this file and must
 * stay exactly as they are: a value that does not begin with `/` is an absolute
 * URL to somewhere else, `//host` is protocol-relative and also somewhere else,
 * and a backslash is the traversal-and-normalisation trick browsers disagree
 * about. Whatever survives them still has to match a known module prefix, so
 * the allowlist — not the guards alone — is what ultimately decides.
 */
export function requestedModule(value: string | null | undefined): ModuleHome | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  return moduleHomes.find(
    (home) => value === home || value.startsWith(`${home}/`) || value.startsWith(`${home}?`),
  ) ?? null
}

/**
 * Where to send a visitor once they have authenticated.
 *
 * An explicit `?redirect=` wins whenever it passes the allowlist. That is
 * deliberate — please do not "fix" it to always return DEFAULT_LANDING.
 *
 * `?redirect=` is not a role-based auto-landing. It is the visitor's own
 * navigation carried across the sign-in page: they clicked "sign in" from the
 * cart, or they opened /admin/login, and they said where they were going
 * before anyone asked who they were. Dropping that would strand people one
 * click short of the thing they came for. What was ruled out is the other
 * thing entirely — the app choosing a destination out of the account's role —
 * and no role is consulted anywhere in this module.
 */
export function moduleHome(value: string | null | undefined): string {
  return requestedModule(value) ?? DEFAULT_LANDING
}

const moduleLabels: Record<ModuleHome, string> = {
  '/shop': 'the shop',
  '/admin': 'the admin console',
  '/social': 'your feed',
  '/apps': 'mini apps',
  '/reels': 'reels',
  // Lower case and no article, like the two above it: the sentence around it
  // is "take you to …", and Tube is a name rather than a place with a "the".
  '/tube': 'Tube',
}

/**
 * Human wording for a requested destination, so the auth page can say where it
 * is about to take someone.
 *
 * Null when no module was explicitly asked for. The sign-in page then speaks
 * for the platform instead of announcing a continuation the visitor never
 * requested — landing on the shop by default is a default, not a journey they
 * started.
 */
export function moduleLabel(value: string | null | undefined): string | null {
  const home = requestedModule(value)
  return home ? moduleLabels[home] : null
}
