/**
 * Console button styles. The ember gradient is reserved for the product mark:
 * its label must be 19px bold to stay legible, which is too loud for a dense
 * work queue. Console actions are ink-on-ground instead, with a red outline
 * for the destructive ones.
 */
const base =
  "inline-flex items-center justify-center gap-1.5 rounded-mo-sm px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"

export const buttonPrimary = `${base} bg-mo-ink text-mo-bg hover:bg-mo-ink/85`
export const buttonSecondary = `${base} border border-mo-strong text-mo-ink hover:bg-mo-raised`
export const buttonDanger = `${base} border border-mo-bad/60 text-mo-bad hover:bg-mo-bad/10`
export const buttonGhost = `${base} text-mo-body hover:bg-mo-raised hover:text-mo-ink`

export const inputClass =
  "w-full rounded-mo-sm border border-mo-strong bg-mo-sunken px-3 py-2 text-sm text-mo-ink placeholder:text-mo-body/70 focus:border-mo-focus focus:outline-none"
