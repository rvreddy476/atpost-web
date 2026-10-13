import { expect, it } from "vitest"
import { bankForProof } from "./bankReview"
const approved={proof_document_id:"old",account_last4:"1111",status:"verified"}
const pending={proof_document_id:"new",account_last4:"2222",status:"pending",active:false,superseded:false}
it("shows the replacement matching the reviewed proof, not the active old account",()=>{
 expect(bankForProof({...approved,history:[pending,approved]},"new")?.account_last4).toBe("2222")
 expect(bankForProof({...approved,history:[pending,approved]},"old")?.account_last4).toBe("1111")
})
it("refuses unmatched, missing and superseded bank proofs",()=>{
 expect(bankForProof(approved,"missing")).toBeNull()
 expect(bankForProof(null,null)).toBeNull()
 expect(bankForProof({...approved,history:[{...pending,superseded:true}]},"new")).toBeNull()
})
