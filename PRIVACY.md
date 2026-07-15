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

Creating and restoring an encrypted backup uses no network request. If a user
manually uploads the downloaded file, the chosen provider can observe provider
account metadata, the generic file name, file size, and timestamps, but receives
only the locally encrypted `.oncore` artifact from On-Core.

Selecting **Open page** or a saved result intentionally opens the original
HTTP(S) URL. That navigation is outside local search and can contact the site
and any resources the site loads under the browser's normal privacy behavior.

## Permissions

| Permission | Purpose |
| --- | --- |
| `activeTab` | Temporarily access the tab chosen for an explicit save |
| `scripting` | Inject the one-time extraction script into that active tab |
| `offscreen` | Run local indexing and model orchestration outside the service worker |
| `storage` | Store the salted local-lock verifier and temporary browser-session unlock state |

`host_permissions` is empty. On-Core does not request access to every website,
browser history, identity, downloads, or external storage providers.

## Local Privacy Lock

Users can configure a PIN or password to hide saved-memory UI, search, counts,
backup controls, and popup capture details. On-Core stores a random 32-byte salt,
PBKDF2 parameters, a 32-byte derived verifier, and the chosen inactivity period
in extension local storage. It never stores the plaintext password. Successful
unlock creates only a timestamp in extension session storage; browser restart,
lock-now, or 5/15/30/60 minutes of inactivity removes that unlocked state.

There is no password recovery. The **Forgot PIN or password** flow requires a
destructive confirmation and then deletes pages, chunks, embeddings, local UI
preferences, and lock state. The reset is not secure erasure from lower storage
layers or external backups.

Local privacy lock prevents casual access through the On-Core interface. Saved
data in the active browser database is not encrypted at rest. Someone with
browser-profile, extension-storage, developer-tools, malware, browser, OS, or
device access can bypass this interface control or inspect plaintext IndexedDB.

## Encrypted Portable Backups

Backups contain saved pages, page metadata, chunks, embeddings, and indexing
state from the current schema-v4 IndexedDB database. They exclude passwords,
keys, UI preferences, model/WASM assets, caches, logs, credentials, extension
identifiers, and service-worker state.

Before download, the payload is encrypted locally with AES-256-GCM and
authenticated envelope metadata. Its key is derived from the user-entered
password using PBKDF2-HMAC-SHA-256 with exactly 600,000 iterations and a random
32-byte salt. Every backup uses a fresh random 12-byte IV. The password and key
are not stored by On-Core.

Import authenticates and fully validates a backup before showing its summary.
Restore is full replacement, never merge, and requires explicit confirmation.
The replacement uses one IndexedDB transaction so a failed write leaves the
previous database intact. Files larger than 128 MiB are rejected before full
processing.

Provider cards are recommendations for manual upload only. Proton Drive,
Tresorit, Peergos, Google Drive, OneDrive, and other storage providers have no
direct integration with On-Core.

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

Encrypted backup files reduce accidental plaintext exposure and prevent a
storage provider from reading an authentic backup without its password. They do
not protect the live IndexedDB database, an unlocked device, process memory
during export/restore, a compromised browser/device, or a weak/reused password.
Password loss is permanent because On-Core has no recovery key or support-side
recovery mechanism. Corruption or tampering causes authenticated decryption to
fail without modifying current records.

## Limitations

No software can provide absolute security. On-Core has not undergone a
professional or independent security audit, makes no claim of absolute privacy, and cannot
protect data after compromise of a trusted local component. The absence of
telemetry also means failures are not reported automatically; users must report
issues deliberately and should avoid including sensitive saved content.

Direct cloud backup, provider APIs, automatic backup, encrypted live storage,
and synchronization are not implemented. The implemented feature is a portable
encrypted file that the user may store or upload manually.
