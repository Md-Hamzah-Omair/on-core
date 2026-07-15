import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { Progress } from '../../../components/Progress';
import { BackupAuthenticationError, MIN_BACKUP_PASSWORD_LENGTH } from '../../../lib/backup-crypto';
import { applyPreparedBackupRestore, createEncryptedDatabaseBackup, prepareEncryptedBackupRestore, type PreparedRestore } from '../../../lib/backup';
import { BACKUP_FILENAME, BACKUP_MIME_TYPE, MAX_BACKUP_FILE_BYTES, type BackupSummary } from '../../../lib/backup-format';

interface BackupAndRestoreProps {
  disabled?: boolean;
  onRestored: (indexingPageId?: number) => void;
}

interface PasswordFieldProps {
  autoComplete: string;
  disabled: boolean;
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}

function PasswordField({ autoComplete, disabled, id, label, onChange, value }: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!value) setRevealed(false);
  }, [value]);
  return (
    <div className="backup-password-field">
      <label htmlFor={id}>{label}</label>
      <div>
        <input id={id} type={revealed ? 'text' : 'password'} autoComplete={autoComplete} disabled={disabled} minLength={MIN_BACKUP_PASSWORD_LENGTH} maxLength={1024} required value={value} onChange={(event) => onChange(event.target.value)} />
        <Button size="small" variant="quiet" aria-label={`${revealed ? 'Hide' : 'Show'} ${label.toLowerCase()}`} disabled={disabled} onClick={() => setRevealed((current) => !current)}>{revealed ? 'Hide' : 'Show'}</Button>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof BackupAuthenticationError) return error.message;
  if (error instanceof RangeError || error instanceof TypeError) return error.message;
  return 'The backup operation could not be completed. Your current data was not changed.';
}

export function BackupAndRestore({ disabled = false, onRestored }: BackupAndRestoreProps) {
  const [exportPassword, setExportPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<'export' | 'import' | 'restore' | null>(null);
  const [status, setStatus] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [exportSummary, setExportSummary] = useState<BackupSummary | null>(null);
  const [preparedRestore, setPreparedRestore] = useState<PreparedRestore | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setPreparedRestore(null);
    setStatus(null);
    if (file && file.size > MAX_BACKUP_FILE_BYTES) {
      setSelectedFile(null);
      event.target.value = '';
      setStatus({ message: 'The selected backup exceeds the 128 MiB limit.', tone: 'error' });
      return;
    }
    setSelectedFile(file);
  }

  async function exportBackup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setExportSummary(null);
    if (exportPassword !== confirmPassword) {
      setStatus({ message: 'The backup passwords do not match.', tone: 'error' });
      return;
    }
    setBusy('export');
    try {
      const result = await createEncryptedDatabaseBackup(exportPassword);
      const downloadBytes = new Uint8Array(result.bytes.byteLength);
      downloadBytes.set(result.bytes);
      const blob = new Blob([downloadBytes.buffer], { type: BACKUP_MIME_TYPE });
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = BACKUP_FILENAME;
        anchor.click();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }
      setExportSummary(result.summary);
      setStatus({ message: 'Encrypted backup downloaded. Keep its password separately.', tone: 'success' });
    } catch (error) {
      setStatus({ message: safeErrorMessage(error), tone: 'error' });
    } finally {
      setExportPassword('');
      setConfirmPassword('');
      setBusy(null);
    }
  }

  async function inspectBackup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setPreparedRestore(null);
    if (!selectedFile) {
      setStatus({ message: 'Choose an .oncore backup file first.', tone: 'error' });
      return;
    }
    if (selectedFile.size > MAX_BACKUP_FILE_BYTES) {
      setStatus({ message: 'The selected backup exceeds the 128 MiB limit.', tone: 'error' });
      return;
    }
    setBusy('import');
    try {
      const prepared = await prepareEncryptedBackupRestore(new Uint8Array(await selectedFile.arrayBuffer()), importPassword);
      setPreparedRestore(prepared);
    } catch (error) {
      setStatus({ message: safeErrorMessage(error), tone: 'error' });
    } finally {
      setImportPassword('');
      setBusy(null);
    }
  }

  async function confirmRestore() {
    if (!preparedRestore) return;
    const queueablePages = new Map<number, { hasPending: boolean; withoutFailures: boolean }>();
    for (const chunk of preparedRestore.data.chunks) {
      const current = queueablePages.get(chunk.pageId) ?? { hasPending: false, withoutFailures: true };
      queueablePages.set(chunk.pageId, {
        hasPending: current.hasPending || chunk.embeddingStatus === 'pending' || chunk.embeddingStatus === 'indexing',
        withoutFailures: current.withoutFailures && chunk.embeddingStatus !== 'failed',
      });
    }
    const indexingPageId = preparedRestore.data.pages.find((page) => {
      if (page.id === undefined) return false;
      const state = queueablePages.get(page.id);
      return state?.hasPending === true && state.withoutFailures;
    })?.id;
    setBusy('restore');
    setStatus(null);
    try {
      await applyPreparedBackupRestore(preparedRestore);
      setPreparedRestore(null);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setStatus({ message: 'Backup restored. The dashboard has been refreshed.', tone: 'success' });
      onRestored(indexingPageId);
    } catch (error) {
      const message = error instanceof Error && error.message === 'Wait for active indexing to finish before restoring a backup.'
        ? error.message
        : 'Restore failed. Your previous local data was preserved.';
      setPreparedRestore(null);
      setStatus({ message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  const isBusy = busy !== null;
  return (
    <Card className="backup-card" aria-labelledby="backup-heading">
      <p className="section-kicker">Portable encrypted backup</p>
      <h3 id="backup-heading">Download, then store anywhere</h3>
      <p className="backup-intro">On-Core encrypts the exported file locally. This does not encrypt the active IndexedDB database.</p>
      <form className="backup-form" onSubmit={(event) => void exportBackup(event)}>
        <PasswordField id="backup-export-password" label="Backup password" autoComplete="new-password" disabled={disabled || isBusy} value={exportPassword} onChange={setExportPassword} />
        <PasswordField id="backup-confirm-password" label="Confirm backup password" autoComplete="new-password" disabled={disabled || isBusy} value={confirmPassword} onChange={setConfirmPassword} />
        <p className="field-help">At least {MIN_BACKUP_PASSWORD_LENGTH} characters. The password is never stored and cannot be recovered.</p>
        <Button type="submit" disabled={disabled || !exportPassword || !confirmPassword} loading={busy === 'export'} loadingLabel="Encrypting backup...">Download encrypted backup</Button>
      </form>
      {exportSummary && <dl className="backup-summary" aria-label="Last exported backup"><div><dt>Created</dt><dd>{new Date(exportSummary.createdAt).toLocaleString()}</dd></div><div><dt>Records</dt><dd>{exportSummary.pageCount} pages, {exportSummary.chunkCount} chunks</dd></div><div><dt>File size</dt><dd>{formatBytes(exportSummary.fileSize)}</dd></div></dl>}
      <div className="backup-divider" aria-hidden="true" />
      <form className="backup-form" onSubmit={(event) => void inspectBackup(event)}>
        <h4>Restore a backup</h4>
        <input ref={fileInputRef} className="ui-visually-hidden" id="backup-file" type="file" accept=".oncore,application/vnd.on-core.backup+json" disabled={disabled || isBusy} onChange={chooseFile} />
        <label className="backup-file-picker" htmlFor="backup-file">{selectedFile ? selectedFile.name : 'Choose .oncore file'}</label>
        {selectedFile && <span className="selected-file-size">{formatBytes(selectedFile.size)}</span>}
        <PasswordField id="backup-import-password" label="Backup password" autoComplete="current-password" disabled={disabled || isBusy} value={importPassword} onChange={setImportPassword} />
        <Button type="submit" variant="secondary" disabled={disabled || !selectedFile || !importPassword} loading={busy === 'import'} loadingLabel="Validating backup...">Review restore</Button>
      </form>
      {isBusy && <div className="backup-progress" role="status" aria-live="polite"><Progress label={busy === 'restore' ? 'Restoring backup' : 'Processing encrypted backup'} /><span>{busy === 'restore' ? 'Replacing local records transactionally...' : 'Processing locally in this browser...'}</span></div>}
      {status && <p className={`backup-status backup-status--${status.tone}`} role={status.tone === 'error' ? 'alert' : 'status'} aria-live="polite">{status.message}</p>}
      <ul className="backup-warnings">
        <li>Losing the password means losing access to the backup.</li>
        <li>Cloud providers may see the file name, size, and timestamps.</li>
        <li>This feature has not undergone a professional security audit.</li>
      </ul>
      <ConfirmDialog open={preparedRestore !== null} title="Replace local saved memories?" description="The backup is valid. Restoring replaces every current page, chunk, and embedding in one transaction. This is not a merge." confirmLabel="Replace and restore" danger loading={busy === 'restore'} onCancel={() => setPreparedRestore(null)} onConfirm={() => void confirmRestore()}>
        {preparedRestore && <dl className="restore-summary"><div><dt>Created</dt><dd>{new Date(preparedRestore.summary.createdAt).toLocaleString()}</dd></div><div><dt>Pages</dt><dd>{preparedRestore.summary.pageCount.toLocaleString()}</dd></div><div><dt>Chunks</dt><dd>{preparedRestore.summary.chunkCount.toLocaleString()}</dd></div></dl>}
      </ConfirmDialog>
    </Card>
  );
}
