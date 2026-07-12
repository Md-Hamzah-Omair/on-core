# Local Web Memory — Agent Instructions

## Stack

- WXT
- React
- TypeScript with strict mode
- pnpm only
- Dexie over IndexedDB
- Transformers.js
- all-MiniLM-L6-v2
- Mozilla Readability
- Vitest for unit tests

## Architecture

- Content scripts may access the page DOM.
- Content scripts must not contain database or model logic.
- AI inference must run locally in a Web Worker.
- Persistent data belongs in IndexedDB, never service-worker globals.
- The dashboard is an extension page.
- Shared AI and search functions must not import WXT or chrome APIs.

## Privacy constraints

- Never send URLs, page text, embeddings, or queries to a server.
- Do not add telemetry or analytics.
- Do not add cloud AI APIs.
- Request the minimum browser permissions.
- Do not add `<all_urls>` without explicit approval.
- Never log complete page content in production.
- Never commit tokens, credentials, model-provider keys, or `.env` files.

## Scope constraints

Do not implement the PWA, accounts, sync, encryption, automatic browsing
capture, or a hosted backend unless the current task explicitly requests it.

## Change policy

- Read PROJECT.md, ARCHITECTURE.md and CURRENT_TASK.md before editing.
- Implement only the approved milestone.
- Avoid unrelated refactors.
- Ask before adding a production dependency.
- Do not commit or push.
- Do not change architecture silently.

## Verification

Before reporting completion, run:

- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build

Report every command and whether it succeeded.

