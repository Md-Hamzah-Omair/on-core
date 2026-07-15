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

Browser evaluation still requires loading `.output/chrome-mv3`, saving real
pages, observing indexing, searching with paraphrases, deleting data, changing
themes/result limits, restarting the browser, and repeating search offline.

## Verification

- Automated tests: 19 test files, 83 tests passed.
- Production Chrome package size: 37.93 MB reported by WXT; filesystem byte
  count for `.output/chrome-mv3` was 37,932,822 bytes.
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
- No latency, memory, accuracy, security-audit, mobile, cloud, or encryption
  performance claim is made.
