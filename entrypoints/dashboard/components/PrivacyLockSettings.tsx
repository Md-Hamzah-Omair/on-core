import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { AUTO_LOCK_OPTIONS, type AutoLockMinutes } from '../../../lib/privacy-lock';

interface PrivacyLockSettingsProps {
  autoLockMinutes: AutoLockMinutes;
  onAutoLockChange: (minutes: AutoLockMinutes) => Promise<void>;
  onLock: () => Promise<void>;
}

export function PrivacyLockSettings({ autoLockMinutes, onAutoLockChange, onLock }: PrivacyLockSettingsProps) {
  return (
    <Card className="privacy-lock-settings" aria-labelledby="privacy-lock-settings-heading">
      <p className="section-kicker">Interface protection</p>
      <h3 id="privacy-lock-settings-heading">Local privacy lock</h3>
      <p>Local privacy lock prevents casual access through the On-Core interface. Saved data in the active browser database is not encrypted at rest.</p>
      <label htmlFor="auto-lock-minutes">Lock after inactivity</label>
      <select id="auto-lock-minutes" value={autoLockMinutes} onChange={(event) => void onAutoLockChange(Number(event.target.value) as AutoLockMinutes)}>
        {AUTO_LOCK_OPTIONS.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
      </select>
      <Button variant="secondary" onClick={() => void onLock()}>Lock now</Button>
    </Card>
  );
}
