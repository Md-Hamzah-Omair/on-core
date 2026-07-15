import type { ProgressHTMLAttributes } from 'react';

export interface ProgressProps extends Omit<ProgressHTMLAttributes<HTMLProgressElement>, 'value'> {
  label: string;
  value?: number;
}

export function Progress({ className, label, max = 100, value, ...props }: ProgressProps) {
  return (
    <progress
      className={['ui-progress', className].filter(Boolean).join(' ')}
      max={max}
      value={value}
      aria-label={label}
      {...props}
    />
  );
}
