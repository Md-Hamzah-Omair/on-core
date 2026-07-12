# Milestone 1 Architecture

The runnable foundation is a WXT Manifest V3 extension using React and strict
TypeScript. It introduces only these extension contexts:

- **Popup:** displays shared project copy and opens the dashboard in a new tab
  with `browser.tabs.create` and an extension-owned URL.
- **Dashboard:** a full-page extension entry displaying a disabled search
  placeholder and the current milestone status.
- **Background:** a minimal service-worker initializer with no runtime logic.

The content-script entry point is stored with WXT's disabled-entry convention.
It is not built, has no URL match patterns, and requests no host access.

Shared project constants and the reusable React button contain no WXT or
browser API dependencies. The manifest has empty `permissions` and
`host_permissions` arrays.

Page extraction, persistence, indexing, AI inference, and functional search
are intentionally outside Milestone 1 and are not represented in the runtime
architecture yet.
