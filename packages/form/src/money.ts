// Money is parsed as text and stored as integer minor units. Nothing here goes
// through a JS float: `12.34 * 100` is 1233.9999999999998, and a catalogue that
// rounds that the wrong way ships a product priced a paisa off.

/** Digits with optional decimals — grouping and noise are stripped before this. */
const NUMERIC = /^(\d+)?(?:\.(\d*))?$/

const CURRENCY_NOISE = /^(?:₹|rs\.?|inr)/i

/**
 * Parse a rupee amount typed by a human into integer minor units (paise).
 *
 * Accepts leading/trailing whitespace, a Rs / INR / rupee-sign prefix, internal
 * spaces, and comma grouping in either Indian ("1,23,456") or Western
 * ("123,456") style. Returns `null` — never a guess — for anything else:
 *   - more than two decimal places (we refuse rather than round someone's money)
 *   - exponent notation, multiple dots, stray commas, a bare "." or sign
 *   - values that cannot be held exactly as a JS integer
 *
 * `-` is accepted because refunds and adjustments are negative; callers that
 * only want positive prices should range-check the result.
 */
export function parseMinor(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null

  // Numbers go through their own string form so the "at most two decimals" rule
  // still bites: String(12.345) is "12.345" and is refused, and a float that has
  // already drifted (0.1 + 0.2) shows its drift instead of being quietly rounded.
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
    return parseMinor(String(raw))
  }

  let s = raw.trim()
  if (!s) return null

  // Stripped either side of the sign, because both "-Rs 5" and "Rs -5" turn up.
  s = s.replace(CURRENCY_NOISE, '').trim()

  let negative = false
  if (s.startsWith('-') || s.startsWith('+')) {
    negative = s.startsWith('-')
    s = s.slice(1).trim()
  }
  s = s.replace(CURRENCY_NOISE, '').trim()

  // \s covers the non-breaking space a pasted amount usually carries.
  s = s.replace(/\s/g, '')
  if (!s) return null

  // Commas are grouping only: never leading, trailing, doubled, or after the dot.
  if (s.includes(',')) {
    if (/^,|,,|,$|\.\d*,/.test(s)) return null
    s = s.replace(/,/g, '')
  }

  const match = NUMERIC.exec(s)
  if (!match) return null

  const whole = match[1] ?? ''
  const frac = match[2] ?? ''
  // "." and a lone sign carry no digits at all.
  if (!whole && !frac) return null
  if (frac.length > 2) return null

  const minor = Number(whole || '0') * 100 + Number(frac.padEnd(2, '0'))
  if (!Number.isSafeInteger(minor)) return null

  return negative ? -minor : minor
}

/**
 * Render integer minor units back into the plain "1234.50" text the input
 * shows. Grouping and the currency symbol are the view's job, not this one's.
 */
export function formatMinor(minor: number | null | undefined): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return ''
  const negative = minor < 0
  const abs = Math.abs(Math.trunc(minor))
  const text = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
  return negative ? `-${text}` : text
}
