/**
 * The four states every Know It screen draws besides its content: loading,
 * empty, failed, and "Know It isn't available yet" (the gateway's dormant gate).
 */
import { AlertTriangle, Clock, LogIn, MessageCircleQuestion } from "lucide-react"
import { FeedSkeleton } from "@momentum/content"
import { COPY } from "@/qa/copy"
import { classifyError, errorMessage } from "@/qa/errors"
import { PILL_ACTION } from "./styles"

function Panel({
  icon,
  title,
  body,
  children,
  role,
}: {
  icon: React.ReactNode
  title: string
  body?: React.ReactNode
  children?: React.ReactNode
  role?: "alert" | "status"
}) {
  return (
    <div role={role} className="rounded-mo border border-mo bg-mo-surface p-8 text-center shadow-mo">
      <div className="mx-auto flex h-8 w-8 items-center justify-center">{icon}</div>
      <h2 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">{title}</h2>
      {body ? <p className="mx-auto mt-2 max-w-sm text-mo-body">{body}</p> : null}
      {children ? <div className="mt-5 flex flex-wrap items-center justify-center gap-3">{children}</div> : null}
    </div>
  )
}

/** A calm screen: Know It is dark for this reader. Never styled as an error. */
export function NotAvailable() {
  return (
    <Panel
      role="status"
      icon={<Clock aria-hidden="true" className="h-8 w-8 text-mo-purple" />}
      title={COPY.notAvailableTitle}
      body={COPY.notAvailableBody}
    />
  )
}

export function EmptyState({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  return (
    <Panel icon={<MessageCircleQuestion aria-hidden="true" className="h-8 w-8 text-mo-purple" />} title={title} body={body}>
      {children}
    </Panel>
  )
}

export function ErrorState({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <Panel
      role="alert"
      icon={<AlertTriangle aria-hidden="true" className="h-8 w-8 text-mo-warn" />}
      title={title ?? COPY.loadFailedTitle}
      body={errorMessage(error)}
    >
      {onRetry ? (
        <button type="button" onClick={onRetry} className={PILL_ACTION}>
          {COPY.retry}
        </button>
      ) : null}
    </Panel>
  )
}

export function SignInPrompt({ title, body, href }: { title: string; body?: string; href: string }) {
  return (
    <Panel icon={<LogIn aria-hidden="true" className="h-8 w-8 text-mo-purple" />} title={title} body={body}>
      {/* /login is the shell's, so a plain anchor, not next/link. */}
      <a href={href} className={PILL_ACTION}>
        {COPY.signIn}
      </a>
    </Panel>
  )
}

export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading">
      <FeedSkeleton count={count} />
    </div>
  )
}

/**
 * The fallback for a query, or null when there is data to draw:
 * pending → skeleton, gate → NotAvailable, error → ErrorState with retry.
 */
export function queryFallback(
  query: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown },
  skeleton: React.ReactNode = <ListSkeleton />,
): React.ReactNode | null {
  if (query.isError) {
    if (classifyError(query.error).kind === "notAvailable") return <NotAvailable />
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }
  if (query.isPending) return skeleton
  return null
}
