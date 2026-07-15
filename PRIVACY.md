# On-Core Privacy

## Summary

On-Core is designed for explicit, local capture and search. It does not
automatically collect browsing history. It has no telemetry, analytics,
backend, account, cloud inference, or normal-operation user-data upload.

## User-Initiated Capture

Capture starts only when the user selects **Save Page** in the popup while a
normal HTTP(S) page is active. On-Core injects a one-time extractor into that
tab, reads a cloned and sanitized representation of the document, and returns
bounded readable text and metadata to the extension.

## Data Processed Locally

- Page title and fragment-free URL
- Extracted readable text
- Optional byline, site name, language, and excerpt
- Cleaned chunks and indexing state
- 384-dimensional local embeddings
- Search queries while a search is running
- Theme and result-count preferences

Page data, chunks, embeddings, and indexing state are stored in extension
IndexedDB. Search queries are processed transiently and are not persisted by
On-Core. UI preferences are stored in extension page local storage.

Page extraction, cleaning, chunking, stored-page embedding generation, query
embedding generation, semantic similarity, lexical ranking, recency ranking,
and IndexedDB persistence run locally. Model and ONNX Runtime WASM assets are
packaged with the extension. Internet access is not required for core search
after installation.

## Network Behavior

Remote model loading is disabled. The extension requests no host permissions,
and CSP limits extension connections to its own origin. On-Core sends no user
data during normal capture, indexing, or search operation.

Selecting **Open page** or a saved result intentionally opens the original
HTTP(S) URL. That navigation is outside local search and can contact the site
and any resources the site loads under the browser's normal privacy behavior.

## Permissions

| Permission | Purpose |
| --- | --- |
| `activeTab` | Temporarily access the tab chosen for an explicit save |
| `scripting` | Inject the one-time extraction script into that active tab |
| `offscreen` | Run local indexing and model orchestration outside the service worker |

`host_permissions` is empty. On-Core does not request access to every website,
browser history, identity, downloads, or external storage providers.

## Deletion

Deleting one saved memory removes that page and its chunks/embeddings from
IndexedDB. **Delete all saved memories** clears all saved pages, chunks, and
embeddings. Theme and result-count preferences remain. Clearing the browser
profile's extension data or uninstalling the extension also removes its local
data according to browser behavior.

Deletion is permanent within On-Core and cannot be undone. The project does not
claim secure erasure from storage media, browser backups, operating-system
snapshots, or forensic recovery layers.

## Threat Model

On-Core primarily reduces exposure to remote application servers by keeping
normal operation local and requesting narrow browser permissions. It assumes
the browser, extension package, browser profile, operating system, and device
are not compromised.

It does not protect against:

- Malware or another process with access to the browser profile
- A compromised browser, extension supply chain, or operating system
- A person with access to an unlocked browser profile or device
- Sensitive text already present in a page the user chooses to save
- Tracking performed by an original website after the user opens it
- Browser or operating-system backups containing extension profile data

Saved content and embeddings are not encrypted at rest by On-Core. Device disk
encryption, operating-system accounts, browser-profile controls, and physical
security are outside the extension boundary.

## Limitations

No software can provide absolute security. On-Core has not undergone an
independent security audit, makes no claim of absolute privacy, and cannot
protect data after compromise of a trusted local component. The absence of
telemetry also means failures are not reported automatically; users must report
issues deliberately and should avoid including sensitive saved content.

Cloud backup and encrypted synchronization are not implemented. They are only
possible future scope and are not part of this privacy model.
