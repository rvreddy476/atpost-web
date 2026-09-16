import type { Route } from '@playwright/test'

/**
 * `GET /v1/admin/me` as admin-service answers it, for specs that mock `/v1/**`.
 * Defaults to a verified MStore admin holding every commerce permission.
 */
export const ADMIN_USER_ID = '00000000-0000-4000-8000-00000000a001'

export const ALL_COMMERCE = [
  'commerce:catalogue.edit',
  'commerce:seller.approve',
  'commerce:seller.suspend',
  'commerce:products.moderate',
  'commerce:kyc.verify',
  'commerce:payouts.read',
  'commerce:cod.settle',
]

export interface AdminMeFixture {
  platform?: string[]
  apps?: Record<string, string[]>
  navigation?: Array<{ app: string; label: string; applications?: string[] }>
  verified?: boolean
  required?: boolean
  stepUpValidUntil?: string | null
}

export function adminMe(fixture: AdminMeFixture = {}) {
  const apps = fixture.apps ?? { commerce: ALL_COMMERCE }
  return {
    data: {
      user_id: ADMIN_USER_ID,
      permissions: { platform: fixture.platform ?? [], apps },
      mfa: { required: fixture.required ?? true, verified: fixture.verified ?? true, auth_time: 1_760_000_000 },
      step_up_valid_until: fixture.stepUpValidUntil ?? null,
      step_up_window_seconds: 300,
      navigation: fixture.navigation ?? Object.keys(apps).map((app) => ({ app, label: app === 'commerce' ? 'MStore' : app })),
    },
  }
}

export const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

export const apiError = (route: Route, status: number, code: string, message = code.toLowerCase()) =>
  json(route, { error: { code, message } }, status)
