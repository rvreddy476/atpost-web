export type PayoutMethodType = "upi" | "bank_transfer" | "paypal";

export interface Wallet {
  user_id: string;
  balance: number;
  balance_paise?: number;
  lifetime_earnings: number;
  lifetime_earnings_paise?: number;
  pending_payout: number;
  pending_payout_paise?: number;
  currency: string;
  is_frozen: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Transaction {
  id: string;
  wallet_id: string;
  type: "earning" | "payout" | "refund" | "adjustment" | "subscription_payment";
  amount: number;
  amount_paise?: number;
  currency: string;
  status: string;
  reference_type: string;
  reference_id: string;
  description?: string;
  created_at: string;
}

export interface PayoutMethod {
  id: string;
  user_id: string;
  method_type: PayoutMethodType;
  details: Record<string, string>;
  details_encrypted?: string;
  is_default: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at?: string;
}

export interface Subscription {
  id: string;
  subscriber_id: string;
  creator_id: string;
  tier_id: string;
  tier_name: string;
  price: number;
  price_paise?: number;
  currency: string;
  status: "active" | "cancelled" | "expired" | "paused";
  current_period_start: string;
  current_period_end: string;
  created_at?: string;
}

export interface CreatorTier {
  id: string;
  creator_id: string;
  name: string;
  price: number;
  price_paise?: number;
  currency: string;
  perks: string[];
  subscriber_count: number;
  is_active: boolean;
  billing_period?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TaxInfo {
  id: string;
  user_id: string;
  country: string;
  tax_data: Record<string, string>;
  tax_data_encrypted?: string;
  verification_status: string;
  created_at?: string;
  updated_at?: string;
}

export interface Dashboard {
  wallet: Wallet;
  recent_transactions: Transaction[];
  tiers: CreatorTier[];
}
