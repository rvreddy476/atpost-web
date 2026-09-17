# Ask (Q&A) web zone

`apps/ask` (`@atpost/ask`) is the web home of the Q&A module: a Next.js
Multi-Zone app served under `/ask`, composed by `apps/shell` through the
`ASK_ZONE_URL` rewrite. It is the web counterpart of Android `:feature:qa`.

## Routes

| path | screen |
|---|---|
| `/ask` | feed (trending, with topics) |
| `/ask/search` | search questions |
| `/ask/questions/[id]` | question detail with answers |
| `/ask/new` | ask a question (signed in) |
| `/ask/topics` | topic directory |
| `/ask/topics/[id]` | one topic and its questions |
| `/ask/me` | your questions, answers and saved items (signed in) |
| `/ask/settings` | Ask notification settings (signed in) |

## Backend

Everything is read from qa-service at `/v1/qa/**` through the api-gateway.

The gateway keeps Q&A dark behind its dormant-product gate:

- `QA_PUBLIC_ENABLED` unset or false: every `/v1/qa/**` call answers
  `404 {"error":{"code":"NOT_FOUND","message":"Not found"}}` (no `meta`),
  unless the verified caller's user id is in `QA_PILOT_USER_IDS`.
- So while dark, signed-out visitors and non-pilot users see
  **"Ask isn't available yet"**; pilot users see the product.
- `QA_PUBLIC_ENABLED=true` removes the gate for everyone.

## Anonymity rule

A question or answer's byline comes from `is_anonymous` and nothing else.
When it is true, render "Anonymous": no name, no avatar, no profile link, and
never the `author_id` (the service masks it to the zero UUID). Do not infer
anonymity from a missing or zero author id.

## Local development

1. Install dependencies:
   ```bash
   bun install
   ```
2. Either run every zone together:
   ```bash
   bun run dev
   ```
   or run only Ask and the shell, in two terminals:
   ```bash
   bun --filter @atpost/ask dev
   ```
   ```bash
   bun --filter @atpost/shell dev
   ```
3. Open http://localhost:3000/ask (through the shell) or
   http://localhost:3013/ask (the zone alone).
4. Run the tests:
   ```bash
   bun --filter @atpost/ask test
   bun run e2e:ask
   ```

The local gateway must have qa-service routed, and either
`QA_PUBLIC_ENABLED=true` or your user id in `QA_PILOT_USER_IDS`, or every
screen shows "Ask isn't available yet".
