"use client"

import { useState } from "react"
import { CheckCircle2, XCircle } from "lucide-react"
import { Input } from "@atpost/ui"

/**
 * A pattern beside the thing that proves it.
 *
 * An untested regex on a required field makes a whole category unusable for
 * every seller at once — nothing they type is accepted and nothing tells them
 * why — which is the most expensive mistake this console can produce. So the
 * pattern is never entered without a sample sitting next to it saying pass or
 * fail on the current keystroke.
 *
 * The pattern is anchored on both ends, matching how the seller form validates
 * it: `^…$`, not "contains".
 */
export function RegexTester({
  pattern,
  onPatternChange,
  disabled,
}: {
  pattern: string
  onPatternChange: (next: string) => void
  disabled?: boolean
}) {
  const [sample, setSample] = useState("")

  let compiled: RegExp | null = null
  let compileError: string | null = null
  if (pattern.trim() !== "") {
    try {
      compiled = new RegExp(`^(?:${pattern})$`)
    } catch (error) {
      compileError = (error as Error).message
    }
  }

  const passes = compiled && sample !== "" ? compiled.test(sample) : null

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-800">
          Pattern
          <Input
            value={pattern}
            disabled={disabled}
            invalid={!!compileError}
            aria-label="Validation pattern"
            placeholder="[A-Z]{2}-\d{4}"
            onChange={(e) => onPatternChange(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-800">
          Try a sample value
          <Input
            value={sample}
            aria-label="Sample value to test against the pattern"
            placeholder="AB-1234"
            onChange={(e) => setSample(e.target.value)}
          />
        </label>
      </div>

      {compileError ? (
        <p data-testid="regex-verdict" className="flex items-center gap-1.5 text-xs text-red-600">
          <XCircle className="h-4 w-4" aria-hidden="true" />
          That is not a valid pattern: {compileError}
        </p>
      ) : pattern.trim() === "" ? (
        <p data-testid="regex-verdict" className="text-xs text-gray-500">
          No pattern — any text is accepted.
        </p>
      ) : sample === "" ? (
        <p data-testid="regex-verdict" className="text-xs text-gray-500">
          Type a sample value to check the pattern before you save it.
        </p>
      ) : passes ? (
        <p
          data-testid="regex-verdict"
          role="status"
          className="flex items-center gap-1.5 text-xs font-medium text-emerald-700"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Sample passes
        </p>
      ) : (
        <p
          data-testid="regex-verdict"
          role="status"
          className="flex items-center gap-1.5 text-xs font-medium text-red-600"
        >
          <XCircle className="h-4 w-4" aria-hidden="true" />
          Sample fails — a seller typing this would be rejected
        </p>
      )}
    </div>
  )
}
