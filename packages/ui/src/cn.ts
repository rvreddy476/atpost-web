export type ClassValue = string | false | null | undefined

// Minimal className combiner (filter falsy + join). Mirrors the app's existing
// `cn` API so components port over unchanged. Swap for clsx + tailwind-merge
// later if precise Tailwind conflict resolution is needed.
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ")
}
