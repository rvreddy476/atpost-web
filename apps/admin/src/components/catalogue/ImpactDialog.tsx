"use client"

import { AlertTriangle } from "lucide-react"
import { Button, Dialog, Table, TBody, TD, TH, THead, TR } from "@atpost/ui"
import { describeImpact } from "@/lib/catalogue"
import { useDefinitions, type NarrowingPrompt } from "@/hooks/useCatalogue"

/**
 * What the founder sees after the server has refused a narrowing edit.
 *
 * The dialog exists so the acknowledgement is produced by a person reading a
 * number, not by a retry loop: the count in the button is the count the server
 * sent back with its 409, and pressing Apply is the only thing in this console
 * that ever attaches `?ack_impact=`.
 */
export function ImpactDialog({
  prompt,
  isPending,
  onConfirm,
  onCancel,
}: {
  prompt: NarrowingPrompt | null
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  // Before the early return: a hook after a conditional return is called on
  // some renders and not others, which is the one thing React's hook ordering
  // cannot survive.
  //
  // The impact rows carry a definition_id and no label — the server has no
  // reason to repeat what this console already holds. Resolving it here is the
  // difference between "Colour — 7 affected" and an em dash.
  const { data: definitions } = useDefinitions()
  const labelFor = (id: string | null) => definitions?.find((d) => d.id === id)?.label ?? null

  if (!prompt) return null
  const { conflict, what } = prompt
  const lines = describeImpact(conflict)

  return (
    <Dialog open onClose={onCancel} title="This change narrows what sellers may enter">
      <div className="flex flex-col gap-4">
        <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">{conflict.what ?? what}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>

        {conflict.details.length > 0 && (
          <Table>
            <THead>
              <TR>
                <TH>Attribute</TH>
                <TH className="text-right">Live products</TH>
                <TH className="text-right">Missing</TH>
                <TH className="text-right">Out of range</TH>
                <TH className="text-right">Affected</TH>
              </TR>
            </THead>
            <TBody>
              {conflict.details.map((detail, index) => (
                <TR key={detail.code ?? detail.definition_id ?? index}>
                  <TD className="font-medium">
                    {detail.label ?? detail.code ?? labelFor(detail.definition_id) ?? "—"}
                  </TD>
                  <TD className="text-right tabular-nums">{detail.live_products}</TD>
                  <TD className="text-right tabular-nums">{detail.missing}</TD>
                  <TD className="text-right tabular-nums">{detail.out_of_range}</TD>
                  <TD className="text-right font-medium tabular-nums">{detail.affected}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}

        <p className="text-xs text-gray-500">
          Nothing is deleted. Affected listings keep their data and stay live; their sellers are
          asked to fix the field the next time they edit.
          {conflict.message && (
            <span className="mt-1 block text-gray-400">Server said: {conflict.message}</span>
          )}
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isPending}>
            {isPending
              ? "Applying…"
              : `Apply anyway — I accept ${conflict.affected.toLocaleString()} affected`}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
