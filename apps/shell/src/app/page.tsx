import Link from "next/link"
import { readServerSession } from "@atpost/api-client/server"

/**
 * The zones that exist, in the words a visitor would use.
 *
 * This list advertised /messenger, /community and /live until now. All three
 * were deleted, so every card but the first was a 404 with a nice hover state.
 * A launcher that sends people nowhere is worse than a shorter launcher. It is
 * kept beside the shell's rewrite table and the post-login allowlist —
 * apps/shell/next.config.ts and src/lib/moduleRedirect.ts — and all three have
 * to agree.
 *
 * This page becomes the feed. Until it does, it says only true things.
 */
const destinations = [
  ["Shop", "/shop", "Browse the marketplace, track orders, sell your own"],
  ["Feed", "/social", "What the people you follow are posting"],
  ["Mini apps", "/apps", "Small tools that run inside Momentum"],
] as const

export default async function Home() {
  // Read on the server so the header is right in the first byte of HTML. A
  // signed-in visitor never sees "Sign in" and then watches it change.
  const { signedIn } = await readServerSession()

  return (
    <main className="shell-page">
      <header className="shell-top">
        <Link href="/" className="brand" aria-label="Momentum home">
          <i aria-hidden="true">M</i>Momentum
        </Link>
        <nav aria-label="Account">
          {signedIn ? (
            <a href="/shop" className="btn btn-outline">Continue</a>
          ) : (
            <>
              <Link href="/login" className="btn btn-outline">Sign in</Link>
              <Link href="/register" className="btn btn-primary">Create account</Link>
            </>
          )}
        </nav>
      </header>

      <section className="hero">
        <span className="eyebrow">Momentum</span>
        <h1>Everything you need, in one connected platform.</h1>
        <p>
          Each experience is deployed and scaled on its own, and one account signs you in to all of
          them. Move between them and nothing asks you to sign in again.
        </p>
        {!signedIn ? (
          <div className="hero-actions">
            <Link href="/register" className="btn btn-primary">Create your account</Link>
            <Link href="/login" className="btn btn-outline">I already have one</Link>
          </div>
        ) : null}
      </section>

      <section className="grid" aria-label="Momentum destinations">
        {destinations.map(([label, href, description]) => (
          // A plain <a>, not next/link: these are separate Next apps behind a
          // rewrite, so a client-side navigation would look for a route this
          // app does not have.
          <a className="card" href={href} key={href}>
            <strong>{label}</strong>
            <span>{description}</span>
            <span className="action">Open →</span>
          </a>
        ))}
      </section>

      <footer className="shell-foot">
        <p>One Momentum account, every part of the platform.</p>
      </footer>
    </main>
  )
}
