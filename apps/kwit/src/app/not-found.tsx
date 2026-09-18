import Link from "next/link"
import { EmptyState } from "@/ui/states"

export default function NotFound() {
  return (
    <EmptyState title="Page not found" body="That link does not lead anywhere in Know It.">
      <Link href="/" className="text-sm font-semibold text-mo-cyan hover:underline">
        Back to Know It
      </Link>
    </EmptyState>
  )
}
