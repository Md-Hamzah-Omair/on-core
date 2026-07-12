Milestone 1 — Runnable Extension Foundation
Decisions
- Initialize the WXT project directly in the existing repository root.
- Use WXT file-based entry points with React and strict TypeScript.
- Build a popup, extension-owned dashboard, and minimal MV3 background worker.
- Keep the content-script entry point disabled so it requests no host access and executes on no pages.
- Open dashboard.html with browser.tabs.create; this requires no permission.
- Use shared constants for project name and placeholder text.
- Add one small reusable React button component.
- Use Vitest with a framework-independent TypeScript unit test.
- Add ESLint because AGENTS.md requires pnpm lint.
- Add no persistence, capture, extraction, AI, search, network, or future architecture.
- Preserve all existing documentation and record Milestone 1 in the empty task and roadmap files.
Files
- package.json: package metadata, pnpm declaration, dependencies, and scripts.
- pnpm-lock.yaml: reproducible pnpm dependency lockfile.
- .gitignore: ignore dependencies, WXT output, coverage, and local files.
- tsconfig.json: extend WXT TypeScript configuration with strict: true.
- wxt.config.ts: React integration and minimal MV3 manifest metadata.
- eslint.config.js: TypeScript and React lint configuration.
- README.md: purpose, milestone status, installation, development, build, and Chrome loading instructions.
- entrypoints/background.ts: empty WXT background service-worker initializer.
- entrypoints/content.ts.disabled: disabled placeholder for the later content-script entry point.
- entrypoints/popup/index.html: popup HTML entry document.
- entrypoints/popup/main.tsx: popup React bootstrap.
- entrypoints/popup/App.tsx: project text, dashboard button, and opening/error state.
- entrypoints/popup/style.css: compact popup styling.
- entrypoints/dashboard/index.html: dashboard HTML entry document.
- entrypoints/dashboard/main.tsx: dashboard React bootstrap.
- entrypoints/dashboard/App.tsx: disabled placeholder search interface and milestone notice.
- entrypoints/dashboard/style.css: responsive full-page dashboard styling.
- components/Button.tsx: reusable typed button.
- lib/project.ts: shared project name and placeholder copy.
- lib/project.test.ts: Vitest setup proof covering shared metadata.
- docs/CURRENT_TASK.md: complete Milestone 1 scope and acceptance criteria.
- docs/ROADMAP.md: mark Milestone 1 as the current foundation milestone.
- docs/ARCHITECTURE.md: document only the extension contexts introduced now.
Dependencies
Production:
- react
- react-dom
Development:
- wxt
- @wxt-dev/module-react
- typescript
- vitest
- eslint
- @eslint/js
- typescript-eslint
- eslint-plugin-react-hooks
- globals
- @types/react
- @types/react-dom
Implementation Steps
 1. Confirm compatible installed Node and pnpm versions.
 2. Initialize WXT in the repository root using the React template without deleting existing files.
 3. Normalize package.json to use pnpm and scripts: dev, build, typecheck, test, and lint.
 4. Configure WXT for React and Manifest V3 with no permissions or host permissions.
 5. Enable strict TypeScript and add the minimal ESLint configuration.
 6. Add shared project constants and the reusable button.
 7. Implement the popup with project text and an Open Dashboard button.
 8. Open /dashboard.html in a new tab using browser.runtime.getURL and browser.tabs.create.
 9. Implement the dashboard with a disabled search placeholder and explicit future-functionality notice.
10. Add the minimal background service-worker entry point.
11. Add the disabled content-script placeholder without URL match patterns.
12. Add the metadata unit test.
13. Write the README and update the three existing documentation files.
14. Install dependencies with pnpm and run all automated verification.
15. Start development mode and complete the manual Chrome checks.
Permissions
Exact manifest permissions:
{
  "permissions": [],
  "host_permissions": []
}
The disabled content script is not emitted into the manifest. No tabs, activeTab, scripting, storage, or host access is requested.
Verification
Automated commands:
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm dev
Manual Chrome checks:
 1. Load .output/chrome-mv3 as an unpacked extension.
 2. Confirm Chrome accepts the extension as Manifest V3.
 3. Open the toolbar popup and verify its name, description, and button.
 4. Click Open Dashboard and verify an extension-owned tab opens.
 5. Verify the dashboard shows a disabled search placeholder and future-functionality notice.
 6. Verify the popup displays a useful error if tab creation fails.
 7. Reload the background worker and confirm no errors occur.
 8. Inspect the generated manifest and confirm both permission arrays are empty.
 9. Confirm no content script is registered or runs on websites.
10. Confirm popup and dashboard load without network access.
Acceptance Criteria
- WXT, React, strict TypeScript, pnpm, and Vitest are configured at the repository root.
- The production build is a loadable Manifest V3 Chrome extension.
- The popup displays Local Web Memory and placeholder text.
- Open Dashboard opens the extension-owned dashboard in a new tab.
- The dashboard contains a disabled placeholder search interface.
- The dashboard states that capture and semantic search are not implemented.
- The background service worker loads without errors.
- A disabled content-script placeholder exists and requests no host access.
- At least one unit test passes.
- All required automated commands succeed.
- README and existing documentation are updated without deletion.
- No excluded functionality or unnecessary permissions are introduced.
Conflicts Resolved
- Content script versus zero host permissions: use WXT’s disabled-entry-point convention, preserving the placeholder without manifest registration.
- tabs permission versus opening the dashboard: omit tabs; tabs.create does not require it.
- Milestone scripts versus AGENTS.md: include lint because repository instructions require it.
- Full future stack versus Milestone 1 exclusions: install only foundation dependencies; defer all storage, extraction, AI, and search packages.
- Temporary or nested initialization versus repository layout: initialize directly at the existing root.
- Component testing versus smallest setup: test shared TypeScript metadata with Vitest and avoid additional DOM-testing dependencies.
- Empty CURRENT_TASK.md versus approved scope: populate it with this milestone during implementation while preserving the file.