import { useState, type FormEvent } from 'react';
import { Button } from '../../../components/Button';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { AUTO_LOCK_OPTIONS, MIN_PRIVACY_LOCK_PASSWORD_LENGTH, type AutoLockMinutes } from '../../../lib/privacy-lock';

interface PrivacyLockScreenProps {
  mode: 'loading' | 'unconfigured' | 'locked';
  onResetData: () => Promise<void>;
  onSetup: (password: string, minutes: AutoLockMinutes) => Promise<void>;
  onUnlock: (password: string) => Promise<boolean>;
}

export function PrivacyLockScreen({ mode, onResetData, onSetup, onUnlock }: PrivacyLockScreenProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [minutes, setMinutes] = useState<AutoLockMinutes>(15);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (mode === 'unconfigured' && password !== confirmation) {
      setError('PIN or password entries do not match.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'unconfigured') {
        await onSetup(password, minutes);
      } else if (mode === 'locked' && !await onUnlock(password)) {
        setError('Incorrect PIN or password.');
      }
    } catch (caught) {
      setError(caught instanceof RangeError ? caught.message : 'The local privacy lock could not be updated.');
    } finally {
      setPassword('');
      setConfirmation('');
      setRevealed(false);
      setBusy(false);
    }
  }

  async function resetData() {
    setBusy(true);
    setError('');
    try {
      await onResetData();
      setConfirmingReset(false);
    } catch {
      setError('Reset did not complete. Some local data may already have been removed. Retry the reset before using On-Core.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="privacy-lock-shell">
      <section className="privacy-lock-panel" aria-labelledby="privacy-lock-title">
        <span className="privacy-lock-mark" aria-hidden="true">OC</span>
        <p className="section-kicker">Local privacy lock</p>
        <h1 id="privacy-lock-title">{mode === 'unconfigured' ? 'Set up interface protection' : mode === 'locked' ? 'On-Core is locked' : 'Checking privacy lock...'}</h1>
        <p className="privacy-lock-explanation">Local privacy lock prevents casual access through the On-Core interface. Saved data in the active browser database is not encrypted at rest.</p>
        {mode !== 'loading' && (
          <form className="privacy-lock-form" onSubmit={(event) => void submit(event)}>
            <label htmlFor="privacy-lock-password">PIN or password</label>
            <div className="privacy-lock-password">
              <input autoFocus id="privacy-lock-password" type={revealed ? 'text' : 'password'} autoComplete={mode === 'unconfigured' ? 'new-password' : 'current-password'} minLength={MIN_PRIVACY_LOCK_PASSWORD_LENGTH} maxLength={1024} required disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} />
              <Button size="small" variant="quiet" disabled={busy} aria-label={`${revealed ? 'Hide' : 'Show'} PIN or password`} onClick={() => setRevealed((current) => !current)}>{revealed ? 'Hide' : 'Show'}</Button>
            </div>
            {mode === 'unconfigured' && (
              <>
                <label htmlFor="privacy-lock-confirmation">Confirm PIN or password</label>
                <input id="privacy-lock-confirmation" className="privacy-lock-input" type={revealed ? 'text' : 'password'} autoComplete="new-password" minLength={MIN_PRIVACY_LOCK_PASSWORD_LENGTH} maxLength={1024} required disabled={busy} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
                <label htmlFor="privacy-lock-timeout">Lock after inactivity</label>
                <select id="privacy-lock-timeout" disabled={busy} value={minutes} onChange={(event) => setMinutes(Number(event.target.value) as AutoLockMinutes)}>
                  {AUTO_LOCK_OPTIONS.map((option) => <option key={option} value={option}>{option} minutes</option>)}
                </select>
                <p className="privacy-lock-help">Use at least {MIN_PRIVACY_LOCK_PASSWORD_LENGTH} characters. Only a salted verifier is stored.</p>
              </>
            )}
            {error && <p className="privacy-lock-error" role="alert">{error}</p>}
            <Button type="submit" size="large" loading={busy} loadingLabel={mode === 'unconfigured' ? 'Setting up...' : 'Unlocking...'}>{mode === 'unconfigured' ? 'Set up privacy lock' : 'Unlock On-Core'}</Button>
          </form>
        )}
        {mode === 'locked' && <Button className="forgot-lock-button" variant="quiet" disabled={busy} onClick={() => setConfirmingReset(true)}>Forgot PIN or password?</Button>}
      </section>
      <ConfirmDialog open={confirmingReset} title="Reset all local On-Core data?" description="There is no password recovery. Resetting permanently deletes saved pages, chunks, embeddings, local preferences, and the privacy-lock verifier. This cannot be undone." confirmLabel="Reset and delete everything" danger loading={busy} onCancel={() => setConfirmingReset(false)} onConfirm={() => void resetData()} />
    </main>
  );
}
