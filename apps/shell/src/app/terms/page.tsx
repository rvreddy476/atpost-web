import type { Metadata } from 'next'
import Link from 'next/link'
import { TERMS_VERSION } from '@/lib/registration'

export const metadata: Metadata = {
  title: `Terms of Service — Momentum`,
  description: `The Momentum terms of service, version ${TERMS_VERSION}.`,
}

/**
 * The destination of the checkbox on the registration form.
 *
 * The registration request asserts that a person read and accepted terms
 * version {TERMS_VERSION}, so that link has to lead somewhere real — a `#` or a
 * 404 would make the assertion we send to the server a lie about something
 * legally load-bearing.
 *
 * The authoritative text is not in this repository yet. Rather than paraphrase
 * or invent it, this page says exactly that and names the version, so nobody
 * reading it comes away believing they have read terms they have not. Replace
 * the section below with the published text; the version string is imported
 * from the same constant the form sends, so the two cannot drift apart.
 */
export default function TermsPage() {
  return (
    <main>
      <section className="hero">
        <span className="eyebrow">Momentum</span>
        <h1>Terms of Service</h1>
        <p>Version {TERMS_VERSION}</p>
      </section>
      <section className="doc">
        <h2>The full text is not published here yet</h2>
        <p>
          Creating a Momentum account records that you accepted version {TERMS_VERSION} of these
          terms. That record is real, and this page is where the text belongs — but the published
          wording has not been added to this build, so there is nothing here to read yet.
        </p>
        <p>
          If you need the current text before you sign up, ask the team operating this
          installation for version {TERMS_VERSION} rather than assuming its contents.
        </p>
        <p>
          <Link href="/register">Back to registration</Link>
        </p>
      </section>
    </main>
  )
}
