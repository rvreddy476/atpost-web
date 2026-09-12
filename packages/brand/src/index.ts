/* ═══════════════════════════════════════════════════════════════════════════
   @momentum/brand — who this product says it is.

   The product has been called two things in this repository at once: "atPost"
   in the shop and "Momentum" in the shell, the feed and the player. That is
   not a tidiness problem, it is a cost problem — the name is expected to
   change again when a domain is settled, and a name spelled out in a dozen
   files in two spellings makes that a week of grep instead of an edit.

   So: one module owns the name. Everything user-visible that carries it reads
   from here.

   ── Why a package and not a file in one app ───────────────────────────────
   Five zones deploy independently (shell, commerce, social, admin, miniapps)
   and three shared packages put brand words on screen (@atpost/ui's role
   switcher, @atpost/api-client's capability list). A constant living in any
   one app cannot be imported by the others without inverting the dependency,
   and a constant duplicated per app is the thing this replaces.

   ── Why not @momentum/tokens, and why not @atpost/types ───────────────────
   Tokens is a stylesheet of colours and spacing with no JavaScript in it at
   all; that is a deliberate property (a zone wears the theme with one CSS
   @import and no build step), and adding a TypeScript entry point would take
   it away. Identity is also not a design token: renaming the product does not
   change a single colour.

   @atpost/types is wire contracts — the shapes the server and the client have
   agreed on. The product's display name is the opposite of that: it is the
   one string we are free to change unilaterally because nothing off-device
   depends on it.

   ── The specifier is not the brand ────────────────────────────────────────
   This package is called `@momentum/brand`, matching the scope its
   contemporaries use (@momentum/tokens, @momentum/player). A rename changes
   the VALUES in this file; it does not have to change the import path,
   because an import path is internal wiring that no user ever reads. If the
   scope is ever renamed it should be renamed across all of @momentum/* as one
   mechanical change, not because the product's display name moved.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The one line to edit when the product is renamed.
 *
 * Everything else in this file is derived from it or sits beside it, so a
 * rename is this constant plus, at most, the two or three strings below whose
 * wording is not a mechanical function of the name.
 */
const NAME = "Momentum"

/**
 * The bare host of the product's public site, without scheme or trailing
 * slash. User-visible: it is printed in the footer and read aloud in support
 * copy, so it moves with the name rather than with deployment config.
 *
 * This is NOT where the app is served from — that is per-zone environment
 * config (AUTH_APP_URL and friends) and is deliberately not modelled here. A
 * staging deploy has a different origin and the same brand.
 */
const DOMAIN = "momentum.app"

export const BRAND = {
  /** The product name as it is written in running text and in a wordmark. */
  name: NAME,

  /**
   * The single glyph the header lockups draw in a tile beside the wordmark.
   * Derived, so a rename cannot leave an "a" tile next to a "Momentum".
   */
  initial: NAME.charAt(0).toUpperCase(),

  /**
   * The commerce zone's own name. The shop is not a separate product and must
   * not read as one, so it is the product name plus a common noun rather than
   * a second brand.
   */
  shop: `${NAME} Shop`,

  /** The suffix a shop lockup sets in small caps under the wordmark. */
  shopSuffix: "SHOP",

  /**
   * The two commerce APPS, as the phone names them and as the web now must.
   *
   * These are not derived from NAME on purpose. The founder's decision
   * (2026-09-12) is that the buyer surface is "MStore" and the seller surface
   * is "MSeller" everywhere: a stylised capital M in ember, then the word.
   * The M is the product's initial today, but the app names are a brand of
   * their own and would survive a rename of the platform, so they are
   * literals here and the wordmark component splits them rather than
   * rebuilding them from `initial`.
   */
  store: "MStore",
  sellerApp: "MSeller",

  /**
   * What an unnamed seller is called on a listing or a cart line. A fallback,
   * shown only when the catalogue did not send a seller name.
   */
  sellerFallback: `${NAME} seller`,

  /** The public site, for display. See DOMAIN above for what this is not. */
  domain: DOMAIN,
  url: `https://${DOMAIN}`,

  /** Where a person is told to write when the web cannot help them. */
  supportEmail: `support@${DOMAIN}`,

  /** The native app, named in copy that explains why the web cannot do a thing. */
  mobileApp: `${NAME} app`,

  /** The one-line description used as the default metadata description. */
  tagline: `One account, every part of the platform.`,
} as const

/**
 * The `<title>` for a zone.
 *
 * One helper rather than five literals, so the separator and the ordering are
 * decided once. `zoneTitle()` with no argument is the shell's bare product
 * name, which is what the front door should say.
 *
 * @example zoneTitle("Shop") // "Momentum — Shop"
 */
export function zoneTitle(zone?: string): string {
  return zone ? `${BRAND.name} — ${zone}` : BRAND.name
}

/* ═══════════════════════════════════════════════════════════════════════════
   STORAGE KEYS AND EVENT NAMES — FROZEN WIRE VALUES, NOT DERIVED STRINGS

   Read this before "tidying" any value below to match BRAND.name.

   These are the strings this product has already written into other people's
   browsers. They are listed here so that a rename has a complete inventory of
   them in one place — and every one of them is a STRING LITERAL, deliberately
   not built from BRAND.name, because changing the value at runtime is a
   user-visible failure, not a cosmetic inconsistency:

     · `postbook:session-changed` is a DOM event dispatched in one tab and
       listened for across @atpost/api-client and the shop's header. Renaming
       it means the dispatcher and the listeners disagree, and a sign-in stops
       updating the chrome that is already on screen.

     · `momentum:session-epoch` is the localStorage key whose write makes
       `storage` fire in the OTHER tabs. Renaming it splits live tabs across
       two keys: a sign-out in one tab stops reaching the others, and a
       browser that already holds the old key keeps a stale one forever.

     · The two legacy keys are the slots the pre-cookie session used. They are
       deleted on load, and they can only be deleted under the names they were
       written with. Renaming them abandons a live bearer token in
       localStorage on every browser that still has one.

     · The commerce keys hold work in progress — an affiliate attribution
       mid-visit, a half-written product listing. Renaming either silently
       discards it the next time that person opens the page.

   That the first two carry two DIFFERENT old brand names is the point rather
   than an oversight: they are archaeology, and archaeology is not renamed. A
   deliberate migration — write both, read either, drop the old one a release
   later — is the only way any of these values may change, and it is a change
   with its own PR, not a side effect of a rebrand.
   ═══════════════════════════════════════════════════════════════════════════ */

export const STORAGE_KEYS = {
  /** DOM event: "the answer to 'is anyone signed in?' may have changed". */
  sessionChangedEvent: "postbook:session-changed",

  /** localStorage: written only to make `storage` fire in other tabs. */
  sessionBroadcast: "momentum:session-epoch",

  /** localStorage: the pre-cookie session, removed on load. */
  legacySession: "postbook_session",

  /** localStorage: the pre-cookie tokens, removed on load. */
  legacyAuthTokens: "postbook_auth_tokens",

  /** sessionStorage: which affiliate link brought this visit. */
  affiliateVia: "atpost.affiliate_via",

  /** localStorage prefix: one in-progress seller listing draft per key. */
  listingScratchPrefix: "atpost.sell.scratch.",
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]
