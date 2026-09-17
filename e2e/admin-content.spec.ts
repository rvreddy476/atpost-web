import { expect, test, type Page, type Route } from '@playwright/test'
import { adminMe, apiError, json, type AdminMeFixture } from './admin-fixtures'

// The Content dashboards (Social, Tube, Q&A, Chat) against a mocked
// admin-service: every /v1/** call is answered here.

const BASE = 'http://127.0.0.1:3022/admin'

test.describe.configure({ timeout: 150_000 })

type Handler = (route: Route, url: URL, method: string) => Promise<void> | void | false

async function mockApi(page: Page, me: AdminMeFixture, handler: Handler = () => false) {
  const seen: string[] = []
  await page.route('**/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    seen.push(`${method} ${url.pathname}${url.search}`)
    if (url.pathname.endsWith('/v1/admin/me')) return json(route, adminMe(me))
    if (url.pathname.endsWith('/v1/auth/admin-session/step-up') && method === 'POST') {
      return json(route, { data: { step_up_valid_until: new Date(Date.now() + 300_000).toISOString() } })
    }
    const handled = await handler(route, url, method)
    if (handled !== false) return
    if (url.pathname.endsWith('/v1/admin/approvals')) return json(route, { data: { items: [] } })
    return json(route, { data: null }, 404)
  })
  return seen
}

async function completeStepUp(page: Page) {
  const dialog = page.getByRole('dialog', { name: "Confirm it's you" })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('6-digit code').fill('123456')
  await dialog.getByRole('button', { name: 'Verify' }).click()
  await expect(dialog).toBeHidden()
}

const CONTENT_NAV = [
  { app: 'social', label: 'Social' },
  { app: 'tube', label: 'Tube' },
  { app: 'qa', label: 'Q&A' },
  { app: 'chat', label: 'Chat' },
]

const SOCIAL_STATS_PARTIAL = {
  data: {
    parts: {
      content: { status: 'ok', source: 'post-service', stats: { flagged_posts_pending: 3, flagged_reels_pending: 0, open_content_reports: 12, generated_at: '2026-09-17T09:00:00Z' } },
      pages: { status: 'unavailable', source: 'user-service', error: 'answered 503', upstream_status: 503 },
    },
    complete: false,
  },
}

test('Social stats render post-service and say business pages are unavailable, never zero', async ({ page }) => {
  await mockApi(
    page,
    { apps: { social: ['social:stats.read', 'social:posts.moderate'] }, navigation: [{ app: 'social', label: 'Social' }] },
    (route, url) => {
      if (url.pathname.endsWith('/v1/admin/social/stats')) return json(route, SOCIAL_STATS_PARTIAL)
      if (url.pathname.endsWith('/v1/admin/social/posts/review-queue')) return json(route, { data: [] })
      return false
    },
  )

  await page.goto(`${BASE}/social`)
  await expect(page.getByRole('heading', { name: 'Social' })).toBeVisible()
  const content = page.locator('[data-part="content"][data-state="ok"]')
  await expect(content.locator('[data-stat="flagged_posts_pending"]')).toContainText('3')
  await expect(content.locator('[data-stat="flagged_reels_pending"]')).toContainText('0')
  await expect(content.locator('[data-stat="open_content_reports"]')).toHaveAttribute('data-tone', 'bad')
  const pages = page.locator('[data-part="pages"][data-state="unavailable"]')
  await expect(pages).toBeVisible()
  await expect(pages).toContainText('Business pages: unavailable (user-service answered 503)')
  await expect(pages).toContainText('not zero')
  await expect(page.locator('[data-stat="pending_review"]')).toHaveCount(0)
  await expect(page.getByRole('tab')).toHaveText(['Posts'])
  await expect(page.getByText('No flagged posts.')).toBeVisible()
})

test('a reel takedown says so, asks for step-up and is sent once more with the same decision id', async ({ page }) => {
  const reel = { id: '11111111-1111-4111-8111-111111111111', author_id: '22222222-2222-4222-8222-222222222222', content_type: 'reel', kind: 'reel', visibility: 'public', review_status: 'flagged', text: 'a flagged reel', created_at: '2026-09-16T08:00:00Z' }
  let calls = 0
  const bodies: Array<Record<string, unknown>> = []
  await mockApi(
    page,
    { apps: { social: ['social:reels.moderate', 'social:reels.remove'] }, navigation: [{ app: 'social', label: 'Social' }] },
    (route, url, method) => {
      if (url.pathname.endsWith('/v1/admin/social/reels/review-queue')) return json(route, { data: [reel] })
      if (url.pathname.endsWith('/v1/admin/social/reels/flagged')) return json(route, { data: [] })
      if (url.pathname.endsWith(`/v1/admin/social/reels/${reel.id}/moderation`) && method === 'POST') {
        calls += 1
        bodies.push(route.request().postDataJSON())
        if (calls === 1) return apiError(route, 403, 'STEP_UP_REQUIRED')
        return json(route, { data: { post_id: reel.id, action: 'reject', resulting_status: 'rejected', changed: true } })
      }
      return false
    },
  )

  await page.goto(`${BASE}/social`)
  await expect(page.getByRole('tab')).toHaveText(['Reels'])
  await page.getByRole('button', { name: `Decide reel ${reel.id}` }).click()

  const dialog = page.getByRole('dialog', { name: 'Decide this reel' })
  await dialog.getByLabel('Decision').selectOption('reject')
  await expect(dialog.getByText('This is a takedown: it needs the remove permission and a fresh 2FA code.')).toBeVisible()
  await dialog.getByLabel('Reason').fill('Nudity in the first three seconds')
  await dialog.getByRole('button', { name: 'Confirm' }).click()

  await completeStepUp(page)
  await expect(page.getByText('Reel decided')).toBeVisible()
  expect(calls).toBe(2)
  expect(bodies[0]).toMatchObject({ action: 'reject', reason: 'Nudity in the first three seconds' })
  expect(typeof bodies[0].decision_id).toBe('string')
  expect(bodies[1]).toEqual(bodies[0])
})

test('a Q&A merge requires a reason within 2,000 characters and asks for step-up', async ({ page }) => {
  const question = '33333333-3333-4333-8333-333333333333'
  const into = '44444444-4444-4444-8444-444444444444'
  let calls = 0
  const bodies: unknown[] = []
  await mockApi(page, { apps: { qa: ['qa:questions.merge'] }, navigation: [{ app: 'qa', label: 'Q&A' }] }, (route, url, method) => {
    if (url.pathname.endsWith(`/v1/admin/qa/questions/${question}/merge`) && method === 'POST') {
      calls += 1
      bodies.push(route.request().postDataJSON())
      if (calls === 1) return apiError(route, 403, 'STEP_UP_REQUIRED')
      return json(route, { data: { id: 'act-1', action_type: 'merge_question', target_id: question } })
    }
    return false
  })

  await page.goto(`${BASE}/qa`)
  await expect(page.getByRole('tab')).toHaveText(['Questions'])
  await page.getByLabel('Question id').fill(question)
  await page.getByRole('button', { name: 'Select question' }).click()
  await expect(page.getByRole('button', { name: 'Hide question' })).toHaveCount(0) // no questions.moderate
  await page.getByRole('button', { name: 'Merge into another question' }).click()

  const dialog = page.getByRole('dialog', { name: 'Merge into another question?' })
  await expect(dialog.getByText('Needs a fresh 2FA code.')).toBeVisible()
  await expect(dialog.getByTestId('reason-counter')).toHaveText('0 / 2000 characters')
  await dialog.getByLabel('Merge into question id').fill(into)
  const confirm = dialog.getByRole('button', { name: 'Merge into another question' })
  await expect(confirm).toBeDisabled() // blank reason
  await dialog.getByLabel('Reason').fill('Duplicate of the earlier question, answers belong together')
  await expect(confirm).toBeEnabled()
  await confirm.click()

  await completeStepUp(page)
  await expect(page.getByText('Question updated')).toBeVisible()
  expect(calls).toBe(2)
  expect(bodies[1]).toEqual({ reason: 'Duplicate of the earlier question, answers belong together', merge_into_id: into })
})

test('a Chat channel suspension asks for step-up', async ({ page }) => {
  const channel = '55555555-5555-4555-8555-555555555555'
  let calls = 0
  const bodies: unknown[] = []
  await mockApi(page, { apps: { chat: ['chat:channels.moderate'] }, navigation: [{ app: 'chat', label: 'Chat' }] }, (route, url, method) => {
    if (url.pathname.endsWith(`/v1/admin/chat/channels/${channel}/suspend`) && method === 'POST') {
      calls += 1
      bodies.push(route.request().postDataJSON())
      if (calls === 1) return apiError(route, 403, 'STEP_UP_REQUIRED')
      return json(route, { data: { channel_id: channel, previous_status: 'active', status: 'suspended' } })
    }
    return false
  })

  await page.goto(`${BASE}/chat`)
  await expect(page.getByRole('tab')).toHaveText(['Channels'])
  await expect(page.getByText('Listing channel reports needs the reports read permission.')).toBeVisible()
  await page.getByLabel('Channel id').fill(channel)
  await page.getByRole('button', { name: 'Select channel' }).click()
  await page.getByRole('button', { name: 'Suspend', exact: true }).click()

  const dialog = page.getByRole('dialog', { name: 'Suspend this channel?' })
  await expect(dialog.getByText('Needs a fresh 2FA code.')).toBeVisible()
  await dialog.getByLabel('Reason').fill('Repeated spam updates after a warning')
  await dialog.getByRole('button', { name: 'Suspend' }).click()

  await completeStepUp(page)
  await expect(page.getByText('Channel is now suspended')).toBeVisible()
  expect(calls).toBe(2)
  expect(bodies[1]).toEqual({ reason: 'Repeated spam updates after a warning' })
})

test('the overview for an admin with only Q&A permissions shows only the Q&A card', async ({ page }) => {
  const seen = await mockApi(page, { apps: { qa: ['qa:stats.read', 'qa:reports.read'] }, navigation: CONTENT_NAV }, (route, url) =>
    url.pathname.endsWith('/v1/admin/qa/stats')
      ? json(route, { data: { open_reports_total: 5, open_reports_by_reason: { spam: 4, harassment: 1 }, hidden_questions_last_7_days: 2, hidden_answers_last_7_days: 0, locked_questions: 1 } })
      : false,
  )
  await page.goto(BASE)

  const qa = page.locator('[data-app-card="qa"]')
  await expect(qa.getByRole('heading', { name: 'Q&A' })).toBeVisible()
  await expect(qa.locator('[data-stat="open_reports_total"]')).toContainText('5')
  await expect(qa.locator('[data-stat="open_reports_total"]')).toHaveAttribute('data-tone', 'bad')
  await expect(qa.locator('[data-stat="hidden_answers_last_7_days"]')).toContainText('0')
  await expect(page.locator('[data-app-card="social"]')).toHaveCount(0)
  await expect(page.locator('[data-app-card="tube"]')).toHaveCount(0)
  await expect(page.locator('[data-app-card="chat"]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /^Social/ })).toHaveCount(0)
  expect(seen.some((s) => /\/v1\/admin\/(social|tube|chat)\//.test(s))).toBe(false)
})
