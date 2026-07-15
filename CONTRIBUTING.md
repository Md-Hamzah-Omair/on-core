# Contributing To On-Core

Keep contributions focused on the local-only browser extension. Do not add
telemetry, remote inference, automatic history capture, broad host permissions,
or external executable assets.

## Development

```sh
pnpm install
pnpm dev
```

Before opening a change, run:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Preserve stable database names, schema/migration identifiers, storage keys,
message identifiers, model identifiers, and packaged asset paths unless a
documented migration is part of the change. Include tests for behavior changes
and avoid placing sensitive page content, credentials, or local planning files
in commits.

Report security-sensitive issues without including captured private data. This
repository does not currently publish a separate private disclosure channel.
