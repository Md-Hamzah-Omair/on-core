# On-Core Technical Report

## Implementation Baseline

On-Core `0.1.0` is a Manifest V3 Chrome extension built with WXT, React,
TypeScript, Dexie, Mozilla Readability, Transformers.js, and ONNX Runtime Web.
It has no backend and performs extraction, embedding, persistence, and ranking
locally.

## Embedding Runtime

| Property | Verified value |
| --- | --- |
| Runtime model ID | `Xenova/all-MiniLM-L6-v2` |
| Source model ID | `sentence-transformers/all-MiniLM-L6-v2` |
| Revision | `751bff37182d3f1213fa05d7196b954e230abad9` |
| ONNX file | `onnx/model_int8.onnx` |
| Quantization | INT8 |
| Dimensions | 384 |
| Pooling | Mean |
| Normalization | Unit-length output plus runtime validation |
| Model execution | Transformers.js feature-extraction pipeline |
| Backend | ONNX Runtime Web on CPU/WASM |
| Worker configuration | One WASM thread, no proxy |
| Remote models | Disabled |
| Browser/WASM caches | Disabled |

The bundled model is a six-layer BERT architecture with hidden size 384, 12
attention heads, and a maximum of 512 positions, as recorded in its packaged
`config.json`.

The model revision is a source-level pin used by the pipeline. The static model
bundle does not contain an independent provenance manifest connecting its file
checksum to the upstream revision, so this report does not make that stronger
claim.

## Package Footprint

Source asset sizes measured with `du -sb` on 2026-07-15:

| Asset group | Bytes |
| --- | ---: |
| Packaged model directory | 23,928,038 |
| `model_int8.onnx` | 22,972,370 |
| Packaged ONNX Runtime WASM directory | 12,966,791 |
| `ort-wasm-simd-threaded.wasm` | 12,942,611 |
| `ort-wasm-simd-threaded.mjs` | 24,180 |

The final generated Chrome package size is recorded after the production build
in the verification section below. Filesystem byte counts can differ slightly
from allocated disk usage and compressed distribution size.

## Capture And Indexing

The capture path injects an extractor only after an explicit user action on an
HTTP(S) tab. Extraction runs Readability on a sanitized clone before falling
back to useful `article`, `main`, and body text. Cleaned page text is bounded to
500,000 characters.

Chunking targets 1,000 characters, has a hard maximum of 1,400 characters, and
uses up to 200 characters of overlap. It prefers paragraph, sentence, and
whitespace boundaries and avoids splitting UTF-16 surrogate pairs.

Dexie schema version 4 stores pages and chunks in IndexedDB. Chunk embedding
commits are checked against page and content revisions. Startup recovery resets
interrupted or stale indexing work, and failed pages expose a retry action.

## Encrypted Backup Format

Portable backups use the `.oncore` extension and JSON format identifier
`on-core-encrypted-backup`, version 1. The encrypted payload contains schema-v4
pages and chunks, including embeddings represented as base64url-encoded
little-endian Float32 bytes. Serialization sorts pages by ID and chunks by page
ID/position and emits fixed-order records.

Web Crypto derives a non-extractable 256-bit AES-GCM key from the password with
PBKDF2-HMAC-SHA-256, exactly 600,000 iterations, and a random 32-byte salt. The
backup uses a fresh random 96-bit IV and a 128-bit GCM tag. Format version,
creation time, schema version, KDF/cipher parameters, salt, IV, and ciphertext
length are authenticated as additional data. Passwords and keys are not
serialized or persisted.

Import is capped at 128 MiB, with a 96 MiB decrypted-payload cap, 10,000-page
cap, and 100,000-chunk cap. It validates exact object keys, bounded strings,
finite safe integers, embedding dimensions/normalization, IDs, URL uniqueness,
page/chunk relationships, revisions, and counts. Restore is full replacement in
one Dexie transaction after decryption, validation, summary review, and explicit
confirmation. The active IndexedDB database remains plaintext.
Restore also rebinds operational content revisions and changes snapshot-captured
`indexing` work to `pending`, so stale pre-restore inference cannot commit into
the replacement records.

## Local Privacy Lock

The dashboard and popup are gated by a shared extension-storage lock before
sensitive UI mounts. A 32-byte verifier is derived with Web Crypto
PBKDF2-HMAC-SHA-256, 600,000 iterations, and a random 32-byte salt. Configuration
uses `browser.storage.local`; unlocked state is only a last-activity timestamp in
`browser.storage.session`. Restart, explicit lock, and configurable inactivity
return the interface to locked. This does not alter or encrypt Dexie schema v4.

## Hybrid Ranking

For each eligible chunk:

```text
semantic = clamp(normalized dot product)

lexical = clamp(
  0.45 * title score
  0.35 * chunk score
  0.15 * hostname score
  0.05 * URL path/query score
  0.15 if the normalized title contains the query phrase
)

recency = 2 ^ (-(now - savedAt) / 90 days)

final = clamp(
  0.65 * semantic
  0.25 * lexical
  0.10 * recency
)
```

A candidate is retained when its semantic score is at least `0.25` or lexical
score is at least `0.10`. The strongest chunk wins per page. Results then sort
by total score, semantic score, lexical score, save date, page ID, and chunk
position. Search is capped at 20,000 candidate chunks and 512 chunks per page.

## Evaluation Method

Vitest exercises extraction fixtures and fallbacks, cleaning, chunking,
embedding validation and protocols, IndexedDB persistence and recovery,
indexing control, hybrid ranking and grouping, dashboard state, privacy
summaries, preferences, message validation, and UI structure. ESLint and strict
TypeScript checks run independently before the WXT production build.
Backup tests cover KDF parameters, AES-GCM round trips, wrong passwords,
ciphertext and authenticated-metadata tampering, IV uniqueness, deterministic
serialization, strict validation, size limits, database replacement, and
transaction rollback.

Browser evaluation still requires loading `.output/chrome-mv3`, saving real
pages, observing indexing, searching with paraphrases, deleting data, changing
themes/result limits, restarting the browser, and repeating search offline.

## Verification

- Automated tests: 26 test files, 109 tests passed.
- Production Chrome package size: 38.01 MB reported by WXT; filesystem byte
  count for `.output/chrome-mv3` was 38,009,374 bytes, an increase of 76,552
  bytes from the pre-backup baseline.
- Tested development environment: Linux x86-64, Node.js `24.15.0`, pnpm
  `11.1.3`.
- Browser version and hardware specifications: Not measured reliably.
- Cold model-load latency: Not measured reliably.
- Page indexing latency: Not measured reliably.
- Warm query latency: Not measured reliably.
- Peak memory usage: Not measured reliably.
- Retrieval accuracy: Not measured reliably.

## Limitations And Failure Cases

- Restricted pages, invalid tabs, extraction timeouts, or insufficient readable
  text produce a capture error.
- Dynamic pages can yield incomplete extraction.
- Missing or incompatible packaged model/WASM assets prevent local inference.
- Worker requests currently have no explicit application-level timeout.
- Search materializes indexed candidates before enforcing its processing cap.
- Corrupt or orphaned IndexedDB records have limited automated repair.
- Linear scan is appropriate for the bounded MVP but not a very large corpus.
- Saved content and embeddings are plaintext within the browser profile.
- The local privacy lock prevents casual UI access only and is bypassable by a
  determined attacker with browser-profile or device access.
- Encrypted export provides no password recovery, live database encryption,
  direct provider integration, automatic backup, merge, or synchronization.
- No latency, memory, accuracy, professional-security-audit, mobile, cloud, or
  encryption-performance claim is made.
