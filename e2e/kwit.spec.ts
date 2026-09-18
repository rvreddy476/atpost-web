import { expect, test, type Page, type Route } from '@playwright/test'
import { seedSessionCookie } from './session'

/**
 * Smoke tests for the Know It zone (apps/kwit, basePath /kwit, e2e port 3023)
 * against a mocked qa-service.
 *
 * ── The fixtures are the wire, not a guess at it ──────────────────────────
 * Each constant below is a byte-identical copy of a golden contract fixture
 * from modernsmapp, `Architecture/services/qa-service/internal/http/testdata/
 * contracts/`, named after the file it came from. qa-service's own tests
 * assert its handlers still produce these bytes, so a mock built from them
 * cannot drift into a shape the service never sends. When a fixture changes
 * there, copy it here again rather than editing it in place.
 *
 * ── What the mock can and cannot reach ────────────────────────────────────
 * `page.route` intercepts what the BROWSER asks for. A fetch the zone makes
 * on the server during SSR goes straight to API_GATEWAY_URL and is invisible
 * here; these specs assume the Know It screens read qa-service from the client,
 * like the shop does.
 */

const BASE = 'http://127.0.0.1:3023/kwit'

test.describe.configure({ timeout: 150_000 })

// question_get_200_anonymous.json
const QUESTION_GET_200_ANONYMOUS =
  '{"data":{"id":"4d5e6f7a-8b9c-4d0e-1f2a-3b4c5d6e7f80","author_id":"00000000-0000-0000-0000-000000000000","title":"How do I tell my manager I am burnt out?","body":"","body_html":"","slug":"how-do-i-tell-my-manager-i-am-burnt-out-4d5e6f7a","status":"open","visibility":"public","language":"en","vote_score":2,"upvote_count":2,"downvote_count":0,"answer_count":0,"view_count":31,"follow_count":0,"is_answered":false,"created_at":"2026-09-16T09:12:04Z","updated_at":"2026-09-16T09:12:04Z","is_pinned":false,"is_anonymous":true}}'

// answers_get_200.json
const ANSWERS_GET_200 =
  '{"data":[{"id":"9f8e7d6c-5b4a-4938-8271-6f5e4d3c2b1a","question_id":"1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d","author_id":"66668bc2-a3f6-40a5-9cdd-c998dcf72f29","body":"Put a connection pool in front of it and measure p99 before you tune anything.","body_html":"","vote_score":12,"upvote_count":12,"downvote_count":0,"is_best":true,"is_accepted":true,"comment_count":1,"reference_count":0,"created_at":"2026-09-16T09:30:00Z","updated_at":"2026-09-16T09:30:00Z","is_saved":false}]}'

// topics_get_200.json
const TOPICS_GET_200 =
  '{"data":[{"id":"7f3f2a1c-1d4e-4a2b-9c8d-2f6b5a4e3c21","name":"Go","slug":"go","description":"The Go programming language.","icon_url":"","question_count":42,"follower_count":310,"is_featured":true,"created_at":"2026-09-16T09:12:04Z","is_following":false}]}'

// questions_get_200.json
const QUESTIONS_GET_200 =
  '{"data":{"pagination":{"has_more":false,"limit":20,"offset":0},"questions":[{"id":"1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d","author_id":"2d598287-eee7-40b4-a7f5-b46b9412e4e7","title":"How do I scale a Go service behind a gateway?","slug":"how-do-i-scale-a-go-service-behind-a-gateway-1a2b3c4d","status":"open","vote_score":7,"answer_count":2,"view_count":140,"is_answered":true,"created_at":"2026-09-16T09:12:04Z","is_pinned":false,"excerpt":"We run one gateway in front of thirty services and the tail latency climbs."}]}}'

/**
 * The feeds (`GET /v1/qa/feed/*`) answer `{ data: [question, …] }` — the
 * handler passes the slice straight to api.JSON — rather than the paginated
 * envelope `GET /v1/qa/questions` uses. There is no golden file for a feed, so
 * this one is derived from the questions fixture's rows, not hand-written.
 */
const FEED_TRENDING_200 = JSON.stringify({ data: JSON.parse(QUESTIONS_GET_200).data.questions })

/**
 * What the api-gateway's dormant-product gate writes for /v1/qa/** while
 * QA_PUBLIC_ENABLED is off and the caller is not in QA_PILOT_USER_IDS
 * (`serveDormantProductGate`, api-gateway/cmd/server/main.go). Note there is no
 * `meta`: qa-service's own 404s carry a request id, the gate's never does,
 * which is how a client can tell "this product is dark" from "no such row".
 */
const GATE_404 = '{"error":{"code":"NOT_FOUND","message":"Not found"}}'

const SIGNED_IN_USER_ID = '66666666-6666-4666-8666-666666666666'

function body(route: Route, raw: string, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: raw })
}

type QaHandler = (route: Route, path: string, method: string) => Promise<void> | false

/**
 * Mock every `/v1/**` call the zone makes. `qa` answers qa-service routes and
 * returns false for anything it does not know; the fallbacks below keep an
 * unexpected call from hanging the page on a gateway that is not running.
 */
async function mockApi(page: Page, qa: QaHandler) {
  await page.route('**/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    const path = url.pathname.replace(/^\/kwit/, '')

    if (path.startsWith('/v1/qa')) {
      const handled = await qa(route, path, method)
      if (handled !== false) return
      // A qa route this smoke suite did not script: empty, but not the gate —
      // the gate body here would turn every screen into "isn't available".
      return body(route, '{"data":[]}')
    }
    if (path === '/v1/auth/me') {
      return body(route, JSON.stringify({ data: { id: SIGNED_IN_USER_ID, email: 'asker@example.com' } }))
    }
    return body(route, '{"error":{"code":"NOT_FOUND","message":"Not found"},"meta":{"request_id":"e2e"}}', 404)
  })
}

/** qa-service while Q&A is live for this viewer. */
const liveQa: QaHandler = (route, path, method) => {
  if (method !== 'GET') return false
  if (path === '/v1/qa/feed/trending') return body(route, FEED_TRENDING_200)
  if (/^\/v1\/qa\/feed\//.test(path)) return body(route, FEED_TRENDING_200)
  if (path === '/v1/qa/topics') return body(route, TOPICS_GET_200)
  if (path === '/v1/qa/questions') return body(route, QUESTIONS_GET_200)
  if (path === '/v1/qa/questions/4d5e6f7a-8b9c-4d0e-1f2a-3b4c5d6e7f80') return body(route, QUESTION_GET_200_ANONYMOUS)
  if (/^\/v1\/qa\/questions\/[^/]+\/answers$/.test(path)) return body(route, ANSWERS_GET_200)
  return false
}

test('signed out, /kwit renders the trending feed and topics', async ({ page }) => {
  const asked: string[] = []
  await mockApi(page, (route, path, method) => {
    asked.push(path)
    return liveQa(route, path, method)
  })

  await page.goto(BASE)

  await expect(page.getByText('How do I scale a Go service behind a gateway?')).toBeVisible()
  await expect(page.getByText('Go', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/isn.t available/i)).toHaveCount(0)
  expect(asked).toContain('/v1/qa/feed/trending')
  expect(asked).toContain('/v1/qa/topics')
})

test('the gateway dormant gate shows "Know It isn\'t available yet"', async ({ page }) => {
  // Signed in but not on the pilot list: the gate answers every /v1/qa path
  // with the same meta-less 404, whoever is asking.
  await seedSessionCookie(page)
  await mockApi(page, (route) => body(route, GATE_404, 404))

  await page.goto(BASE)

  // COPY.notAvailableTitle in apps/kwit/src/qa/copy.ts, word for word.
  await expect(page.getByText("Know It isn't available yet").first()).toBeVisible()
  await expect(page.getByText('How do I scale a Go service behind a gateway?')).toHaveCount(0)
})

test('an anonymous question shows its title and an "Anonymous" byline', async ({ page }) => {
  await mockApi(page, liveQa)

  await page.goto(`${BASE}/questions/4d5e6f7a-8b9c-4d0e-1f2a-3b4c5d6e7f80`)

  await expect(page.getByRole('heading', { name: 'How do I tell my manager I am burnt out?' })).toBeVisible()
  await expect(page.getByText('Anonymous', { exact: true }).first()).toBeVisible()
  // The byline comes from is_anonymous alone. The masked author id is not a
  // person and must never be rendered or linked as one.
  await expect(page.getByText('00000000-0000-0000-0000-000000000000')).toHaveCount(0)
  await expect(page.locator('a[href*="00000000-0000-0000-0000-000000000000"]')).toHaveCount(0)
})
