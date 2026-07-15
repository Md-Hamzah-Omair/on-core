# On-Core Attribution

License information below was verified from installed package metadata, the
lockfile, and the bundled model license on 2026-07-15. Runtime and development
dependencies retain their own licenses.

| Component | Version / identity | Purpose | License |
| --- | --- | --- | --- |
| WXT | `0.20.27` | Browser-extension build tooling and Manifest V3 entrypoints | MIT |
| React | `19.2.7` | Popup and dashboard UI | MIT |
| React DOM | `19.2.7` | React browser renderer | MIT |
| Dexie | `4.4.4` | IndexedDB persistence | Apache-2.0 |
| Mozilla Readability | `0.6.0` | Readable article extraction | Apache-2.0 |
| Transformers.js | `4.2.0` | Local feature-extraction pipeline | Apache-2.0 |
| ONNX Runtime Web | `1.26.0-dev.20260416-b7804b056c` | CPU/WASM model execution | MIT |
| `Xenova/all-MiniLM-L6-v2` | revision `751bff37182d3f1213fa05d7196b954e230abad9` | Packaged quantized embedding model | Apache-2.0 |
| `sentence-transformers/all-MiniLM-L6-v2` | source model identity | Upstream sentence embedding model | Apache-2.0 |
| Vitest | `3.2.7` | Automated test runner | MIT |
| ESLint | `9.39.5` | Static analysis | MIT |

The full Apache 2.0 text distributed with the model is retained at
`public/models/Xenova/all-MiniLM-L6-v2/LICENSE`. The project-level MIT terms are
in [LICENSE](LICENSE).

## Assets

On-Core currently has no third-party icon, logo, font, screenshot, or media
asset. The `OC` product marks and small interface glyphs are rendered with text
and CSS. The only bundled executable/data assets beyond application code are
the attributed model files and ONNX Runtime Web WASM runtime.

Transitive packages used by the pnpm dependency graph retain their respective
licenses as declared in their package metadata.

## Platform Cryptography

Encrypted `.oncore` export and restore use the browser's standards-based Web
Crypto API for PBKDF2-HMAC-SHA-256 and AES-256-GCM. No third-party cryptography
or cloud-provider SDK was added for this feature.
