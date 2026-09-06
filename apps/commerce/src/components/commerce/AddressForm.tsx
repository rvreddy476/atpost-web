'use client'

import { useState } from 'react'

export type AddressFormValues = {
  full_name: string
  phone: string
  address_line_1: string
  address_line_2: string
  city: string
  state: string
  postal_code: string
  address_type: 'home' | 'work' | 'other'
  is_default?: boolean
}

const emptyForm: AddressFormValues = {
  full_name: '', phone: '', address_line_1: '', address_line_2: '',
  city: '', state: '', postal_code: '', address_type: 'home',
}

type Props = {
  initialValues?: Partial<AddressFormValues>
  submitLabel?: string
  showDefault?: boolean
  onSubmit: (v: AddressFormValues) => Promise<unknown> | unknown
  onCancel?: () => void
}

export function AddressForm({ initialValues, submitLabel = 'Save', showDefault = false, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<AddressFormValues>({ ...emptyForm, ...initialValues })
  const [submitting, setSubmitting] = useState(false)

  const update = (k: keyof AddressFormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit(form)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
      <input required placeholder="Full name" value={form.full_name} onChange={update('full_name')}
        className="field col-span-2" />
      <input required placeholder="Phone" value={form.phone} onChange={update('phone')}
        className="field col-span-2" />
      <input required placeholder="Address line 1" value={form.address_line_1} onChange={update('address_line_1')}
        className="field col-span-2" />
      <input placeholder="Address line 2" value={form.address_line_2} onChange={update('address_line_2')}
        className="field col-span-2" />
      <input required placeholder="City" value={form.city} onChange={update('city')}
        className="field" />
      <input required placeholder="State" value={form.state} onChange={update('state')}
        className="field" />
      <input required placeholder="Postal code" value={form.postal_code} onChange={update('postal_code')}
        className="field" />
      <select value={form.address_type} onChange={(e) => setForm({ ...form, address_type: e.target.value as AddressFormValues['address_type'] })}
        aria-label="Address type" className="field">
        <option value="home">Home</option><option value="work">Work</option><option value="other">Other</option>
      </select>
      {showDefault ? (
        <label className="choice-row col-span-2">
          <input type="checkbox" checked={!!form.is_default}
            onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
          Set as default address
        </label>
      ) : null}
      <div className="col-span-2 flex gap-2">
        <button type="submit" disabled={submitting}
          className="btn btn-gold">
          {submitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className="btn btn-outline">
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  )
}
