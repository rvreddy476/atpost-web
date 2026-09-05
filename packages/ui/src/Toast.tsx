"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react"
import { cn } from "./cn"

export type ToastVariant = "info" | "success" | "warning" | "error"

export interface ToastOptions {
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: ToastVariant
  /** Milliseconds before it dismisses itself. Pass 0 to make it stay. */
  duration?: number
  /** Fully custom body — MessageToastContent, or anything else. */
  content?: React.ReactNode
  action?: { label: string; onClick: () => void }
}

export interface Toast extends ToastOptions {
  id: string
}

export interface ToastApi {
  /** Show a toast; returns its id so a caller can dismiss it early. */
  toast: (options: ToastOptions) => string
  success: (title: React.ReactNode, description?: React.ReactNode) => string
  error: (title: React.ReactNode, description?: React.ReactNode) => string
  dismiss: (id: string) => void
  clear: () => void
  toasts: Toast[]
}

const ToastContext = createContext<ToastApi | null>(null)

/** Errors that stay until dismissed; everything else clears itself. */
const DEFAULT_DURATION: Record<ToastVariant, number> = {
  info: 4000,
  success: 3000,
  warning: 6000,
  error: 0,
}

export interface ToastProviderProps {
  children: React.ReactNode
  /** Oldest toasts drop off once this many are on screen. */
  limit?: number
  position?: "top-right" | "top-center" | "bottom-right" | "bottom-center"
}

/**
 * The host `MessageToastContent` never had. Without it every admin mutation
 * failure was swallowed — the button re-enabled and nothing said why — so this
 * provider exists as much for error reporting as for confirmations.
 */
export function ToastProvider({ children, limit = 4, position = "top-right" }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (options: ToastOptions) => {
      const variant = options.variant ?? "info"
      const id = `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      const duration = options.duration ?? DEFAULT_DURATION[variant]

      setToasts((current) => [...current, { ...options, variant, id }].slice(-limit))
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        )
      }
      return id
    },
    [dismiss, limit],
  )

  const clear = useCallback(() => {
    timers.current.forEach((timer) => clearTimeout(timer))
    timers.current.clear()
    setToasts([])
  }, [])

  // Never leave a timer running after the tree unmounts. The map is captured
  // on mount so the cleanup does not read a ref that has since moved on.
  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((timer) => clearTimeout(timer))
      map.clear()
    }
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, description) => toast({ title, description, variant: "success" }),
      error: (title, description) => toast({ title, description, variant: "error" }),
      dismiss,
      clear,
      toasts,
    }),
    [toast, dismiss, clear, toasts],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} position={position} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error("useToast must be used inside a <ToastProvider>")
  }
  return context
}

const POSITIONS: Record<NonNullable<ToastProviderProps["position"]>, string> = {
  "top-right": "top-4 right-4 items-end",
  "top-center": "top-4 left-1/2 -translate-x-1/2 items-center",
  "bottom-right": "bottom-4 right-4 items-end",
  "bottom-center": "bottom-4 left-1/2 -translate-x-1/2 items-center",
}

const ICONS: Record<ToastVariant, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
}

const ACCENTS: Record<ToastVariant, string> = {
  info: "text-brand-text/70",
  success: "text-emerald-600",
  warning: "text-amber-600",
  error: "text-red-500",
}

function ToastViewport({
  toasts,
  onDismiss,
  position,
}: {
  toasts: Toast[]
  onDismiss: (id: string) => void
  position: NonNullable<ToastProviderProps["position"]>
}) {
  return (
    <div
      // `pointer-events-none` on the stack, restored per toast, so the region
      // never blocks clicks on the page behind it.
      className={cn(
        "pointer-events-none fixed z-[100] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2",
        POSITIONS[position],
      )}
    >
      {toasts.map((t) => {
        const variant = t.variant ?? "info"
        const Icon = ICONS[variant]
        return (
          <div
            key={t.id}
            role={variant === "error" ? "alert" : "status"}
            aria-live={variant === "error" ? "assertive" : "polite"}
            className="pointer-events-auto w-full overflow-hidden rounded-2xl border border-brand-text/10 bg-brand-card shadow-lg"
          >
            {t.content ?? (
              <div className="flex items-start gap-3 p-3">
                <Icon aria-hidden="true" className={cn("mt-0.5 h-4 w-4 shrink-0", ACCENTS[variant])} />
                <div className="min-w-0 flex-1">
                  {t.title && (
                    <p className="text-sm font-medium leading-tight text-brand-text">{t.title}</p>
                  )}
                  {t.description && (
                    <p className="mt-0.5 text-xs leading-snug text-brand-text/70">{t.description}</p>
                  )}
                  {t.action && (
                    <button
                      type="button"
                      onClick={() => {
                        t.action?.onClick()
                        onDismiss(t.id)
                      }}
                      className="mt-2 text-xs font-medium text-brand-text underline underline-offset-2"
                    >
                      {t.action.label}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => onDismiss(t.id)}
                  className="shrink-0 rounded-full p-1 text-brand-text/40 hover:bg-brand-text/5"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
