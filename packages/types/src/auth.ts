/**
 * What the signed-in person is allowed to be.
 *
 * The wire shape of `GET /v1/auth/me/capabilities` (identity-auth), plus the
 * one derived shape the web zones render from it.
 *
 * Two facts about this endpoint are load-bearing and easy to lose:
 *
 *  1. **Roles are read live from identity's own tables.** The access token's
 *     `scopes` claim lags by up to one refresh, so a role granted thirty
 *     seconds ago is in this response and NOT in the token. Nothing on the web
 *     should read roles out of the token.
 *
 *  2. **`capabilities` always names every role in the vocabulary**, true or
 *     false — a client never has to know which roles exist to ask about one.
 *     That is why `Capabilities` carries an open index signature as well as
 *     the seven known keys: an eighth role added server-side arrives here as a
 *     key this build has never heard of, and the switcher shows it rather than
 *     dropping it on the floor.
 *
 * "Customer" is deliberately absent from `RoleName`. It is not a role — every
 * account is a customer, which is what `is_customer` says, and it is always
 * true. Modelling it as a role would invite code that checks whether someone
 * "has" it.
 */

/** The seven grantable roles. Customer is not one of them; see above. */
export type RoleName =
  | "superadmin"
  | "admin"
  | "moderator"
  | "seller"
  | "restaurant_owner"
  | "delivery_partner"
  | "rider_partner"

/**
 * Every role in the vocabulary, answered yes or no.
 *
 * The mapped half gives `caps.seller` its `boolean` type and makes a response
 * that forgot a role a compile error. The index signature is what lets a
 * consumer walk `Object.entries(caps)` and meet a role added after this build
 * shipped.
 */
export type Capabilities = { [K in RoleName]: boolean } & { [role: string]: boolean }

/** The pseudo-role the server uses for "just a shopper" in `switcher`. */
export type SwitcherRole = "customer" | RoleName

/**
 * One row of the server's own suggested menu.
 *
 * The web zones do not render this array directly — they collapse the three
 * admin roles into one entry and re-word the rest for a menu of *destinations*
 * rather than a list of role names, so the server's flat list cannot be shown
 * verbatim. It is modelled here because it is part of the response, and
 * because it is the right thing for a client that wants the server's wording.
 */
export interface SwitcherEntry {
  role: SwitcherRole
  label: string
}

/** The body of `GET /v1/auth/me/capabilities`. */
export interface CapabilitiesResponse {
  user_id: string
  /** Only the roles actually held. `capabilities` is the exhaustive answer. */
  roles: RoleName[]
  /** Always true for an authenticated caller. Every account is a customer. */
  is_customer: boolean
  capabilities: Capabilities
  switcher: SwitcherEntry[]
}

/**
 * One place this person could go, as the role switcher renders it.
 *
 * `href` is null for a role that has no web app at all. Such an entry is still
 * produced, and still shown: see the reasoning on the RoleSwitcher component.
 */
export interface RoleDestination {
  /** Stable key — the role it was derived from, or "admin" for the trio. */
  id: string
  /** The hat, in the person's words: "Customer", "Seller", "Moderator". */
  label: string
  /** Where that hat takes them, or what it is: one short line. */
  description: string
  /** An absolute path across zones, or null when the web cannot serve it. */
  href: string | null
  /** Why `href` is null. Null exactly when `href` is non-null. */
  unavailableReason: string | null
}
