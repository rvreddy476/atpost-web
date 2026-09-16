export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-4">
      <div className="min-w-0 flex-1">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-mo-eyebrow text-mo-body">{eyebrow}</p>
        ) : null}
        <h1 className="font-mo-display text-2xl font-semibold tracking-mo-display text-mo-ink">{title}</h1>
        {description ? <div className="mt-1 max-w-3xl text-sm text-mo-body">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** Honest placeholder for a screen whose backend route lands in a later wave. */
export function ComingNext({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-mo border border-dashed border-mo-strong bg-mo-surface/60 p-6 text-sm text-mo-body">
      {children}
    </div>
  )
}
