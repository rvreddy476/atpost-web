const destinations = [
  ["Shop", "/shop", "Discover products and manage orders"],
  ["Messages", "/messenger", "Continue your conversations"],
  ["Communities", "/community", "Connect around shared interests"],
  ["Live", "/live", "Watch and host live experiences"],
] as const

export default function Home() {
  return (
    <main>
      <section className="hero">
        <span className="eyebrow">Momentum</span>
        <h1>Everything you need, in one connected platform.</h1>
        <p>Each experience is independently deployed and optimized while your navigation remains consistent.</p>
      </section>
      <section className="grid" aria-label="Momentum destinations">
        {destinations.map(([label, href, description]) => (
          <a className="card" href={href} key={href}>
            <strong>{label}</strong>
            <span>{description}</span>
            <span className="action">Open →</span>
          </a>
        ))}
      </section>
    </main>
  )
}
