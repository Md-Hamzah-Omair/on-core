import type { HTMLAttributes, ReactNode } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'danger';
}

export function Badge({ children, className, tone = 'neutral', ...props }: BadgeProps) {
  return <span className={['ui-badge', `ui-badge--${tone}`, className].filter(Boolean).join(' ')} {...props}>{children}</span>;
}
