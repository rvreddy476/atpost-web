import { readObject, str, type Row } from "./data"

// Review the account linked to this exact proof, not an older approved account.
export function bankForProof(current: Row | null, proofId: string | null): Row | null {
  if (!current || !proofId) return null
  const records = [current, ...(Array.isArray(current.history) ? current.history : [])]
  for (const record of records) {
    const bank = readObject({ data: record })
    if (bank && bank.superseded !== true && str(bank.proof_document_id) === proofId) return bank
  }
  return null
}
