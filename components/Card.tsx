import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

export function Card({ children, className, ...props }: CardProps) {
  return <article className={['ui-card', className].filter(Boolean).join(' ')} {...props}>{children}</article>;
}
