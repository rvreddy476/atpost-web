"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowRight, MapPin, Plus, Star, Trash2 } from "lucide-react"
import { StoreHeader } from "@/components/StoreHeader"
import { StoreFooter } from "@/components/StoreFooter"
import { AddressForm } from "@/components/commerce/AddressForm"
import {
  isSignedOut, useAddAddress, useAddresses, useCategories, useDeleteAddress, useSession, useSetDefaultAddress,
} from "@/hooks/useCommerce"

/**
 * The address book behind the profile menu's "Addresses". The same hooks
 * and the same form the checkout uses, so an address added here is the one
 * the checkout offers, and there is one shape of address in the zone.
 */
export default function AddressesPage() {
  const session = useSession()
  const { data: addresses, isLoading, error } = useAddresses()
  const { data: categories } = useCategories()
  const add = useAddAddress()
  const setDefault = useSetDefaultAddress()
  const remove = useDeleteAddress()
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  if ((session.known && !session.signedIn) || isSignedOut(error)) return (
    <div className="flex min-h-screen flex-col">
      <StoreHeader categories={categories} />
      <main className="empty-vbag flex-1">
        <div className="empty-vbag-mark"><MapPin size={32} aria-hidden="true" /></div>
        <span className="shop-eyebrow">Addresses</span>
        <h1>Sign in to see<br />where you ship.</h1>
        <p>Your addresses are kept with your account.</p>
        <Link href="/login?redirect=/shop/addresses" className="btn btn-gold btn-lg mt-8">
          Sign in <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </main>
      <StoreFooter />
    </div>
  )

  const list = addresses ?? []

  return (
    <div className="flex min-h-screen flex-col">
      <StoreHeader categories={categories} />
      <main className="shop-page-narrow flex-1">
        <span className="shop-eyebrow">Your account</span>
        <h1 className="shop-display mt-3 text-3xl sm:text-[40px]">Addresses</h1>
        <p className="mt-2 text-sm text-shop-muted">Where your orders are delivered. The default is offered first at checkout.</p>

        {notice ? <div className="notice notice-error mt-6" role="alert">{notice}</div> : null}

        <div className="mt-8 flex flex-col gap-3">
          {isLoading ? <div className="cart-state"><span className="cart-loader" />Loading your addresses…</div> : null}
          {!isLoading && list.length === 0 && !adding ? (
            <div className="panel panel-pad flex flex-col items-center py-16 text-center">
              <div className="empty-vbag-mark"><MapPin size={30} aria-hidden="true" /></div>
              <p className="text-shop-muted">No addresses yet. Add one and checkout will offer it.</p>
            </div>
          ) : null}
          {list.map((address) => (
            <div key={address.id} className="panel flex flex-wrap items-start justify-between gap-4 p-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <strong>{address.contact_name}</strong>
                  {address.is_default ? <span className="status-pill text-shop-gold">Default</span> : null}
                  {address.address_type ? <span className="text-[11px] uppercase tracking-[0.1em] text-shop-faint">{address.address_type}</span> : null}
                </div>
                <div className="mt-1.5 text-sm text-shop-muted">
                  {[address.address_line_1, address.address_line_2, address.city, address.state, address.postal_code]
                    .filter(Boolean).join(", ")}
                </div>
                <div className="mt-1 text-sm text-shop-faint">{address.phone}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {!address.is_default ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={setDefault.isPending}
                    onClick={() => setDefault.mutateAsync(address.id).catch(() => setNotice("The default could not be changed."))}
                  >
                    <Star size={14} aria-hidden="true" /> Make default
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={remove.isPending}
                  onClick={() => remove.mutateAsync(address.id).catch(() => setNotice("The address could not be removed."))}
                >
                  <Trash2 size={14} aria-hidden="true" /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        {!adding ? (
          <button type="button" onClick={() => setAdding(true)} className="shop-link mt-6">
            <Plus size={15} aria-hidden="true" /> Add a new address
          </button>
        ) : (
          <div className="panel panel-pad mt-6">
            <AddressForm
              showDefault
              onSubmit={async (values) => {
                setNotice(null)
                try {
                  await add.mutateAsync(values)
                  setAdding(false)
                } catch {
                  setNotice("The address could not be saved. Check the fields and try again.")
                }
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        )}
      </main>
      <StoreFooter />
    </div>
  )
}
