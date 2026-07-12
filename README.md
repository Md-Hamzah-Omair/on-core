# Local Web Memory

Local Web Memory is a privacy-first browser extension for building a private,
offline-searchable memory from user-approved webpages.

Milestone 1 provides only the runnable extension foundation: a popup, an
extension-owned dashboard, and a minimal Manifest V3 background worker. Page
capture and semantic search are not implemented yet.

## Install

Requires Node.js and pnpm.

```sh
pnpm install
```

## Develop

```sh
pnpm dev
```

## Verify and build

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Load in Chrome

1. Run `pnpm build`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Select **Load unpacked**.
5. Choose `.output/chrome-mv3` from this repository.

The extension requests no browser permissions or host access in Milestone 1.
