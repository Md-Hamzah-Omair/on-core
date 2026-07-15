import type { SelectHTMLAttributes } from 'react';
import { useThemePreference, type ThemePreference } from '../lib/ui-preferences';

export interface ThemeControlProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  label?: string;
}

export function ThemeControl({ className, id = 'theme-preference', label = 'Theme', ...props }: ThemeControlProps) {
  const { preference, setPreference } = useThemePreference();
  return (
    <label className={['ui-theme-control', className].filter(Boolean).join(' ')} htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={preference} onChange={(event) => setPreference(event.target.value as ThemePreference)} {...props}>
        <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
      </select>
    </label>
  );
}
