import type { CreatePaymentIntentInput, Order, PaymentIntent } from '@/hooks/useCommerce'
import { openRazorpayCheckout } from './razorpay'

type ConfirmPaymentInput = {
  order_id: string
  payment_intent_id: string
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
  amount_minor: number
  gateway?: string
}

const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? ''
const stubEnabled = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_ENABLE_STUB_PAYMENTS === 'true'

export async function completeOrderPayment(
  order: Order,
  createIntent: (input: CreatePaymentIntentInput) => Promise<PaymentIntent>,
  confirmPayment: (input: ConfirmPaymentInput) => Promise<unknown>,
) {
  if (!key && !stubEnabled) throw new Error('Online payment is temporarily unavailable. Please try again later.')

  const intent = await createIntent({
    payee_id: order.id,
    reference_type: 'order',
    reference_id: order.id,
    amount: order.final_amount,
    currency: order.currency_code || 'INR',
    method: 'razorpay',
    idempotency_key: `order:${order.id}`,
  })
  const amountMinor = Math.round(order.final_amount * 100)

  if (stubEnabled && !key) {
    await confirmPayment({
      order_id: order.id,
      payment_intent_id: intent.id,
      razorpay_order_id: intent.provider_ref ?? `stub_order_${Date.now()}`,
      razorpay_payment_id: `stub_pay_${Date.now()}`,
      razorpay_signature: 'stub_signature',
      amount_minor: amountMinor,
      gateway: 'stub',
    })
    return
  }
  if (!intent.provider_ref) throw new Error('Payment provider did not return an order id.')

  const response = await openRazorpayCheckout({
    key,
    order_id: intent.provider_ref,
    amount: amountMinor,
    currency: order.currency_code || 'INR',
    name: 'VChat',
    description: `Order ${order.order_number}`,
  })
  await confirmPayment({
    order_id: order.id,
    payment_intent_id: intent.id,
    razorpay_order_id: response.razorpay_order_id,
    razorpay_payment_id: response.razorpay_payment_id,
    razorpay_signature: response.razorpay_signature,
    amount_minor: amountMinor,
    gateway: 'razorpay',
  })
}
