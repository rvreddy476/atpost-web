import { expect, test, type Page, type Route } from '@playwright/test'
import { adminMe, apiError, json, type AdminMeFixture } from './admin-fixtures'

// The Access page against a mocked admin-service (/v1/admin/access/*).

const BASE = 'http://127.0.0.1:3022/admin'

test.describe.configure({ timeout: 150_000 })

type Handler = (route: Route, url: URL, method: string) => Promise<void> | void | false

async function mockApi(page: Page, me: AdminMeFixture, handler: Handler = () => false) {
  await page.route('**/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    if (url.pathname.endsWith('/v1/admin/me')) return json(route, adminMe(me))
    if (url.pathname.endsWith('/v1/auth/admin-session/step-up') && method === 'POST') {
      return json(route, { data: { step_up_valid_until: new Date(Date.now() + 300_000).toISOString() } })
    }
    const handled = await handler(route, url, method)
    if (handled !== false) return
    if (url.pathname.endsWith('/v1/admin/approvals')) return json(route, { data: { items: [] } })
    if (url.pathname.endsWith('/v1/admin/access/catalogue')) return json(route, CATALOGUE)
    if (url.pathname.endsWith('/v1/admin/access/roles') && method === 'GET') return json(route, { data: { holders: [], env_holders: [], limit: 50, offset: 0 } })
    return json(route, { data: null }, 404)
  })
}

async function completeStepUp(page: Page) {
  const dialog = page.getByRole('dialog', { name: "Confirm it's you" })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('6-digit code').fill('123456')
  await dialog.getByRole('button', { name: 'Verify' }).click()
  await expect(dialog).toBeHidden()
}

const USER = '22222222-2222-4222-8222-222222222222'
const ALL_ACCESS = ['platform:roles.read', 'platform:roles.manage', 'platform:sessions.revoke', 'platform:users.search']

const CATALOGUE = {
  data: {
    roles: [{ name: 'superadmin', label: 'Super-admin', platform_only: true }, 'admin', 'moderator'],
    apps: ['dating', 'food', 'commerce'],
    permissions: {
      superadmin: { platform: ['*'] },
      admin: { dating: ['dating:*'] },
      moderator: { dating: ['dating:reports.act', 'dating:photos.review', 'dating:selfie.review'] },
    },
  },
}

test('Access: granting a dating moderator previews its permissions, asks for step-up and succeeds', async ({ page }) => {
  let grantCalls = 0
  const bodies: unknown[] = []
  await mockApi(page, { platform: ALL_ACCESS, navigation: [] }, (route, url, method) => {
    if (url.pathname.endsWith('/v1/admin/access/users/search')) {
      expect(url.searchParams.get('q')).toBe('asha')
      return json(route, { data: { results: [{ user_id: USER, email_masked: 'asha.k@example.com', handle: 'asha' }] } })
    }
    if (url.pathname.endsWith(`/v1/admin/access/users/${USER}/roles`) && method === 'POST') {
      grantCalls += 1
      bodies.push(route.request().postDataJSON())
      return grantCalls === 1 ? apiError(route, 403, 'STEP_UP_REQUIRED') : json(route, { data: { user_id: USER, role: 'moderator', app: 'dating' } })
    }
    return false
  })

  await page.goto(`${BASE}/access`)
  await expect(page.getByRole('heading', { name: 'Access' })).toBeVisible()
  await expect(page.getByRole('tab')).toHaveText(['Holders', 'Grant', 'Audit'])
  await page.getByRole('tab', { name: 'Grant' }).click()

  await page.getByLabel('Find a user').fill('asha')
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page.getByText('a***@example.com')).toBeVisible()
  await expect(page.getByText('asha.k@example.com')).toHaveCount(0) // never unmasked, even if the server slips
  await page.getByRole('button', { name: 'Pick @asha' }).click()
  await expect(page.locator('[data-picked-user]')).toContainText('@asha')

  await page.getByLabel('Role', { exact: true }).selectOption('moderator')
  await page.getByLabel('Scope').selectOption('dating')
  const preview = page.locator('[data-permission-preview]')
  await expect(preview.getByRole('listitem')).toHaveText(['dating:photos.review', 'dating:reports.act', 'dating:selfie.review'])
  await expect(page.getByRole('note')).toHaveCount(0)

  // The reason is required, and an expiry in the past is refused before any call.
  await page.getByLabel('Expires (optional)').fill('2020-01-01T10:00')
  await page.getByRole('button', { name: 'Grant role' }).click()
  await expect(page.getByText('The expiry must be in the future.')).toBeVisible()
  await expect(page.getByText('A reason is required for this action.')).toBeVisible()
  expect(grantCalls).toBe(0)
  await page.getByLabel('Expires (optional)').fill('')
  await page.getByLabel('Reason').fill('Covers the dating report queue for September')
  await page.getByRole('button', { name: 'Grant role' }).click()

  await completeStepUp(page)
  await expect(page.getByText('Role granted')).toBeVisible()
  expect(grantCalls).toBe(2)
  expect(bodies[0]).toEqual({ role: 'moderator', app: 'dating', expires_at: null, reason: 'Covers the dating report queue for September' })
  expect(bodies[1]).toEqual(bodies[0])
})

test('Access: a super-admin grant is locked platform-wide, warns about the second approver, and 202 shows "Sent for approval"', async ({ page }) => {
  let body: unknown = null
  await mockApi(page, { platform: ALL_ACCESS, navigation: [] }, (route, url, method) => {
    if (url.pathname.endsWith('/v1/admin/access/users/search')) return json(route, { data: { results: [{ user_id: USER, email_masked: 'r***@example.com', handle: 'ravi' }] } })
    if (url.pathname.endsWith(`/v1/admin/access/users/${USER}/roles`) && method === 'POST') {
      body = route.request().postDataJSON()
      return json(route, { data: { approval: { id: 'ap-1', status: 'pending', operation: 'access.role.grant' } } }, 202)
    }
    return false
  })

  await page.goto(`${BASE}/access`)
  await page.getByRole('tab', { name: 'Grant' }).click()
  await page.getByLabel('Find a user').fill('ravi')
  await page.getByRole('button', { name: 'Search' }).click()
  await page.getByRole('button', { name: 'Pick @ravi' }).click()
  await page.getByLabel('Role', { exact: true }).selectOption('superadmin')
  await expect(page.getByLabel('Scope')).toBeDisabled()
  await expect(page.getByRole('note')).toContainText('second approver')
  await expect(page.locator('[data-permission-preview]').getByRole('listitem')).toHaveText(['*'])
  await page.getByLabel('Reason').fill('Second platform admin, agreed with the founder')
  await page.getByRole('button', { name: 'Grant role' }).click()

  await expect(page.getByText('Sent for approval')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open the approvals inbox' })).toBeVisible()
  await expect(page.getByText('Role granted')).toHaveCount(0)
  expect(body).toEqual({ role: 'superadmin', app: null, expires_at: null, reason: 'Second platform admin, agreed with the founder' })
})

test('Access: holders show 2FA and expiry, env holders cannot be revoked, and ENV_BOOTSTRAP_ROLE is explained', async ({ page }) => {
  const holders = {
    data: {
      holders: [
        { user_id: USER, role: 'moderator', app: 'dating', expires_at: '2027-01-01T00:00:00Z', reason: 'Queue cover', granted_by: '00000000-0000-4000-8000-00000000a001', granted_at: '2026-09-01T00:00:00Z', mfa_enrolled: false, active: true },
      ],
      env_holders: [{ user_id: '99999999-9999-4999-8999-999999999999', role: 'superadmin', app: null, mfa_enrolled: true, active: true }],
      limit: 50,
      offset: 0,
    },
  }
  let revokeCalls = 0
  let revokeBody: unknown = null
  await mockApi(page, { platform: ALL_ACCESS, navigation: [] }, (route, url, method) => {
    if (url.pathname.endsWith('/v1/admin/access/roles') && method === 'GET') return json(route, holders)
    if (url.pathname.endsWith(`/v1/admin/access/users/${USER}/roles/moderator`) && method === 'DELETE') {
      revokeCalls += 1
      revokeBody = route.request().postDataJSON()
      return apiError(route, 409, 'ENV_BOOTSTRAP_ROLE', 'role comes from env')
    }
    return false
  })

  await page.goto(`${BASE}/access`)
  const table = page.getByRole('table', { name: 'Role holders' })
  await expect(table.getByText('Not enrolled')).toBeVisible()
  await expect(table.getByText('Active')).toBeVisible()
  await expect(table.getByText('Queue cover')).toBeVisible()
  const env = page.getByRole('table', { name: 'Roles granted by configuration' })
  await expect(env.getByText('Configuration', { exact: true })).toBeVisible()
  await expect(env.getByRole('button', { name: /Revoke/ })).toHaveCount(0)
  await expect(env.getByRole('button', { name: /Force logout/ })).toBeVisible()

  await table.getByRole('button', { name: `Revoke moderator from ${USER}` }).click()
  const dialog = page.getByRole('dialog', { name: 'Revoke Moderator from this user?' })
  await dialog.getByLabel('Reason').fill('Left the moderation rota this week')
  await dialog.getByRole('button', { name: 'Revoke' }).click()

  await expect(page.getByText("granted by the deployment's configuration")).toBeVisible()
  expect(revokeCalls).toBe(1)
  expect(revokeBody).toEqual({ app: 'dating', reason: 'Left the moderation rota this week' })
})

test('Access: a roles.read holder sees Holders and Audit only; a platform admin without roles permissions sees the page but no tabs', async ({ page }) => {
  await mockApi(page, { platform: ['platform:roles.read'], navigation: [] }, (route, url) => (url.pathname.endsWith('/v1/admin/access/audit') ? json(route, { data: { items: [] } }) : false))
  await page.goto(`${BASE}/access`)
  await expect(page.getByRole('tab')).toHaveText(['Holders', 'Audit'])
  await expect(page.getByRole('button', { name: /Force logout/ })).toHaveCount(0)

  await mockApi(page, { platform: ['platform:sessions.revoke'], navigation: [] })
  await page.goto(`${BASE}/access`)
  await expect(page.getByRole('heading', { name: 'Access' })).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(0)
  await expect(page.getByText('Your platform permissions do not include reading or managing roles.')).toBeVisible()
})
