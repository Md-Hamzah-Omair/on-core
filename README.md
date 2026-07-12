# Local Web Memory

Local Web Memory is a privacy-first browser extension for building a private,
offline-searchable memory from user-approved webpages.

Milestone 3 adds deterministic text cleaning and chunking to explicit local
page capture. Click **Save Page** in the
extension popup to capture the active HTTP(S) page's title, URL, and visible
text. The extension cleans text while preserving paragraphs, creates local
chunks, and stores both in extension IndexedDB. Semantic search is not
implemented yet.

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

The extension requests only `activeTab` and `scripting` to capture the page the
user explicitly saves. It requests no host permissions and sends no browsing
data to a server.

## Capture a page

1. Open a normal HTTP or HTTPS webpage.
2. Open the Local Web Memory popup.
3. Click **Save Page** and wait for the success message.
4. Click **Open Dashboard** to view saved pages, newest first.

Saving the same page URL again updates its locally stored title, visible text,
chunks, and save time. URL fragments are ignored; query parameters are
preserved. The dashboard can show local chunk previews and permanently delete a
saved page with all of its chunks.
