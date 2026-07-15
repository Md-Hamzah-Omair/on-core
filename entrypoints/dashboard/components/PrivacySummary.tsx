import { useState } from 'react';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { formatStorageEstimate, LOCAL_RUNTIME_DETAILS, type LocalDataSummary } from '../../../lib/privacy-settings';

interface PrivacySummaryProps {
  deleting: boolean;
  onDeleteAll: () => Promise<boolean>;
  storageUsage?: number;
  summary: LocalDataSummary | null;
}

export function PrivacySummary({ deleting, onDeleteAll, storageUsage, summary }: PrivacySummaryProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <aside className="privacy-column" id="privacy-settings" aria-labelledby="privacy-heading">
      <Card className="privacy-summary">
        <p className="section-kicker">Privacy at a glance</p><h2 id="privacy-heading">Yours, and yours alone.</h2>
        <p className="privacy-intro">Your saved pages and search queries stay inside this browser profile.</p>
        <ul className="privacy-promises">
          <li><span aria-hidden="true">✓</span>Entirely on-device</li>
          <li><span aria-hidden="true">✓</span>No cloud inference</li>
          <li><span aria-hidden="true">✓</span>No telemetry</li>
        </ul>
        <div className="privacy-metrics" aria-label="Local data summary">
          <div><strong>{summary?.pageCount.toLocaleString() ?? '—'}</strong><span>Saved pages</span></div>
          <div><strong>{summary?.chunkStatuses.indexed.toLocaleString() ?? '—'}</strong><span>Indexed chunks</span></div>
          <div><strong>Bundled</strong><span>Model status</span></div>
        </div>
        <details className="technical-details">
          <summary>Technical details</summary>
          <dl>
            <div><dt>Model</dt><dd>{LOCAL_RUNTIME_DETAILS.modelId}</dd></div>
            <div><dt>Revision</dt><dd>{LOCAL_RUNTIME_DETAILS.modelRevision}</dd></div>
            <div><dt>Embeddings</dt><dd>{LOCAL_RUNTIME_DETAILS.dimension} dimensions · version {LOCAL_RUNTIME_DETAILS.embeddingVersion}</dd></div>
            <div><dt>Runtime</dt><dd>{LOCAL_RUNTIME_DETAILS.runtime}</dd></div>
            <div><dt>Permissions</dt><dd>activeTab, scripting, offscreen</dd></div>
            <div><dt>Host permissions</dt><dd>None</dd></div>
            <div><dt>Storage</dt><dd>{formatStorageEstimate(storageUsage)}</dd></div>
          </dl>
          {summary && <p>Pages: {summary.pageStatuses.indexed} indexed, {summary.pageStatuses.indexing + summary.pageStatuses.pending} in progress, {summary.pageStatuses.failed} failed. Chunks: {summary.chunkStatuses.indexed} indexed, {summary.chunkStatuses.failed} failed.</p>}
          <p>Model, WASM, scripts, and styles are packaged with the extension. The extension CSP permits self-hosted connections only.</p>
          <p>Saved content remains in this browser profile until deleted, browser data is cleared, or the extension is uninstalled.</p>
        </details>
      </Card>
      <Card className="danger-zone">
        <p className="section-kicker">Destructive action</p><h3>Delete saved data</h3><p>Theme and result-count preferences are kept. Saved pages, chunks, and embeddings are removed permanently.</p>
        <Button variant="danger" disabled={!summary?.pageCount} loading={deleting} loadingLabel="Deleting..." onClick={() => setConfirming(true)}>Delete all saved memories</Button>
      </Card>
      <ConfirmDialog open={confirming} title="Delete all saved memories?" description={`This permanently removes ${summary?.pageCount ?? 0} saved pages, their chunks, and local embeddings. This cannot be undone.`} confirmLabel="Delete everything" danger loading={deleting} onCancel={() => setConfirming(false)} onConfirm={() => void onDeleteAll().then((deleted) => { if (deleted) setConfirming(false); })} />
    </aside>
  );
}
