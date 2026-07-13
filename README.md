# Local Web Memory

Local Web Memory is a privacy-first browser extension for building a private,
offline-searchable memory from user-approved webpages.

Milestone 4 adds local offline embeddings to explicit page capture. Click
**Save Page** in the extension popup to capture the active HTTP(S) page's title,
URL, and visible text. The extension cleans text while preserving paragraphs,
creates local chunks, indexes them with the packaged
`Xenova/all-MiniLM-L6-v2` INT8 model, and stores pages, chunks, vectors, and
durable progress in extension IndexedDB. Semantic search is not implemented yet.

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

The extension requests only `activeTab`, `scripting`, and `offscreen` to capture
the page the user explicitly saves and index it outside the service worker. It
requests no host permissions and sends no browsing data to a server. Model and
WASM assets are bundled, so the first index runs offline without a download.

## Capture a page

1. Open a normal HTTP or HTTPS webpage.
2. Open the Local Web Memory popup.
3. Click **Save Page** and wait for the queued-indexing success message.
4. Click **Open Dashboard** to view saved pages, indexing progress, and chunks.

Saving the same page URL again updates its locally stored title, visible text,
chunks, vectors, and save time. URL fragments are ignored; query parameters are
preserved. The dashboard can show local chunk previews, retry failed or
incomplete indexing, and permanently delete a saved page with all chunks.
