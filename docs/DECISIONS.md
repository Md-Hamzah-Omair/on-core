## ADR-001: Dashboard runs inside extension

Decision:
Use a full-page extension dashboard rather than a separately hosted website.

Reason:
The dashboard can directly access the extension's IndexedDB and continues
working offline.

## ADR-002: Manual capture first

Decision:
Use activeTab and an explicit Save Page action for the MVP.

Reason:
Smaller permission surface and clearer privacy behaviour.