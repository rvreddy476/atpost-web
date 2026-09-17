"use client"

import { useState } from "react"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { Field, LookupForm } from "@/components/blocks/bits"
import { buttonDanger, buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { isUuid, num, readObject } from "@/lib/admin/data"
import { MON, monetizationRefundHint } from "@/lib/admin/monetization"
import { REFUND_SECOND_APPROVER_NOTE, formatPaise, parseRupeeInput } from "@/lib/admin/money"
import { can } from "@/lib/admin/sections"
import { MON_KEY } from "./MonetizationQueues"

const validateUuid = (v: string) => (isUuid(v) ? null : "Enter a full user id (a UUID).")

type WalletAction = "freeze" | "unfreeze" | "rebuild"

const WALLET_ACTIONS: Record<WalletAction, { permission: string; label: string; title: string; explain: string; destructive: boolean }> = {
  freeze: {
    permission: "wallet.freeze",
    label: "Freeze",
    title: "Freeze this wallet?",
    explain: "The creator can no longer withdraw or spend their balance until it is unfrozen.",
    destructive: true,
  },
  unfreeze: {
    permission: "wallet.unfreeze",
    label: "Unfreeze",
    title: "Unfreeze this wallet?",
    explain: "The creator can use their balance again.",
    destructive: false,
  },
  rebuild: {
    permission: "wallet.rebuild",
    label: "Rebuild from ledger",
    title: "Rebuild this wallet's balance?",
    explain: "Recomputes the balance from the ledger and overwrites the stored balance.",
    destructive: true,
  },
}

/** Freeze, unfreeze or rebuild a creator wallet, found by user id. Each needs a fresh 2FA code. */
export function Wallets() {
  const { me } = useAdmin()
  const [userId, setUserId] = useState<string | null>(null)
  const [action, setAction] = useState<WalletAction | null>(null)
  const run = useAdminMutation<{ action: WalletAction; reason: string }>({
    request: ({ action: a, reason }) => ({ method: "post", url: `${MON}/wallet/${encodeURIComponent(userId ?? "")}/${a}`, body: { reason } }),
    invalidate: [MON_KEY],
    successMessage: (data) => {
      const body = readObject(data)
      const balance = body ? num(body.new_balance) : null
      return balance !== null ? `Wallet rebuilt: balance ${formatPaise(balance)}` : "Wallet updated"
    },
    errorTitle: "Wallet action failed",
    onDone: () => setAction(null),
  })
  const allowed = (Object.keys(WALLET_ACTIONS) as WalletAction[]).filter((a) => can(me, "monetization", WALLET_ACTIONS[a].permission))
  const current = action ? WALLET_ACTIONS[action] : null

  return (
    <section>
      <LookupForm label="Creator user id" placeholder="00000000-0000-0000-0000-000000000000" button="Find wallet" validate={validateUuid} onSubmit={setUserId} />
      {userId ? (
        <div className="rounded-mo border border-mo bg-mo-surface p-4">
          <p className="mb-1 text-sm text-mo-ink">
            Wallet of <span className="font-mo-mono">{userId}</span>
          </p>
          <p className="mb-3 text-xs text-mo-body">The console cannot show a wallet&apos;s balance or frozen state yet; the result of each action is shown when it completes.</p>
          <div className="flex flex-wrap gap-2">
            {allowed.map((a) => (
              <button key={a} type="button" className={WALLET_ACTIONS[a].destructive ? buttonDanger : buttonSecondary} onClick={() => setAction(a)}>
                {WALLET_ACTIONS[a].label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <ConfirmReasonDialog
        open={current !== null}
        title={current?.title ?? ""}
        description={current ? `${current.explain} Needs a fresh 2FA code.` : null}
        confirmLabel={current?.label ?? "Confirm"}
        destructive={current?.destructive ?? false}
        requireReason
        busy={run.isPending}
        onConfirm={(reason) => action && run.mutate({ action, reason })}
        onClose={() => setAction(null)}
      />
    </section>
  )
}

/** Suspend or unsuspend a creator from the creator fund. Needs a fresh 2FA code. */
export function Creators() {
  const [creatorId, setCreatorId] = useState<string | null>(null)
  const [action, setAction] = useState<"suspend" | "unsuspend" | null>(null)
  const run = useAdminMutation<{ action: "suspend" | "unsuspend"; reason: string }>({
    request: ({ action: a, reason }) => ({ method: "post", url: `${MON}/creator-fund/${encodeURIComponent(creatorId ?? "")}/${a}`, body: { reason } }),
    invalidate: [MON_KEY],
    successMessage: (data) => (readObject(data)?.status === "active" ? "Creator unsuspended" : "Creator fund status updated"),
    errorTitle: "Creator action failed",
    onDone: () => setAction(null),
  })

  return (
    <section>
      <LookupForm label="Creator user id" placeholder="00000000-0000-0000-0000-000000000000" button="Select creator" validate={validateUuid} onSubmit={setCreatorId} />
      {creatorId ? (
        <div className="rounded-mo border border-mo bg-mo-surface p-4">
          <p className="mb-3 text-sm text-mo-ink">
            Creator <span className="font-mo-mono">{creatorId}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonDanger} onClick={() => setAction("suspend")}>
              Suspend from the creator fund
            </button>
            <button type="button" className={buttonSecondary} onClick={() => setAction("unsuspend")}>
              Unsuspend
            </button>
          </div>
        </div>
      ) : null}
      <ConfirmReasonDialog
        open={action !== null}
        title={action === "suspend" ? "Suspend this creator?" : "Unsuspend this creator?"}
        description={
          action === "suspend"
            ? "They stop earning from the creator fund immediately. Past settled earnings stay. Needs a fresh 2FA code."
            : "They can earn from the creator fund again. Needs a fresh 2FA code."
        }
        confirmLabel={action === "suspend" ? "Suspend" : "Unsuspend"}
        destructive={action === "suspend"}
        requireReason
        busy={run.isPending}
        onConfirm={(reason) => action && run.mutate({ action, reason })}
        onClose={() => setAction(null)}
      />
    </section>
  )
}

/** Refund a monetization transaction. Every refund goes to a second approver, whatever the amount. */
export function MonetizationRefunds() {
  const [transactionId, setTransactionId] = useState("")
  const [disputeId, setDisputeId] = useState("")
  const [amount, setAmount] = useState("")
  const [confirming, setConfirming] = useState(false)
  const paise = parseRupeeInput(amount)
  const hint = monetizationRefundHint(paise)
  const valid = isUuid(transactionId) && paise !== null && (disputeId.trim() === "" || isUuid(disputeId))
  const refund = useAdminMutation<{ reason: string }>({
    request: ({ reason }) => ({
      method: "post",
      url: `${MON}/refunds`,
      body: { transaction_id: transactionId.trim(), amount_paise: paise, reason, ...(disputeId.trim() ? { dispute_id: disputeId.trim() } : {}) },
    }),
    invalidate: [MON_KEY],
    successMessage: "Refund issued",
    errorTitle: "Refund failed",
    onDone: () => {
      setConfirming(false)
      setAmount("")
      setTransactionId("")
      setDisputeId("")
    },
  })

  return (
    <section className="max-w-xl space-y-3">
      <Field label="Transaction id">{(id) => <input id={id} className={inputClass} value={transactionId} onChange={(e) => setTransactionId(e.target.value)} />}</Field>
      <Field label="Amount in rupees" hint={<span data-testid="mon-refund-hint">{hint}</span>}>
        {(id) => <input id={id} className={inputClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
      </Field>
      <Field label="Dispute id (optional)">{(id) => <input id={id} className={inputClass} value={disputeId} onChange={(e) => setDisputeId(e.target.value)} />}</Field>
      <button type="button" className={buttonPrimary} disabled={!valid} onClick={() => setConfirming(true)}>
        Send refund for approval
      </button>
      <ConfirmReasonDialog
        open={confirming}
        title="Refund this transaction?"
        description={
          <>
            {formatPaise(paise)} on transaction {transactionId.trim()}. Needs a fresh 2FA code. <span data-testid="mon-refund-confirm-hint">{REFUND_SECOND_APPROVER_NOTE}</span>
          </>
        }
        confirmLabel="Send for approval"
        destructive
        busy={refund.isPending}
        onConfirm={(reason) => refund.mutate({ reason })}
        onClose={() => setConfirming(false)}
      />
    </section>
  )
}
