import { redirect } from 'next/navigation'

export default function LegacyCommerceRegister() {
  redirect('/register?redirect=/shop')
}
