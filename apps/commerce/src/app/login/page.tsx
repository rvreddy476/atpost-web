import { redirect } from 'next/navigation'

export default function LegacyCommerceLogin() {
  redirect('/login?redirect=/shop')
}
