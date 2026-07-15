import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingLabel?: string;
  size?: 'small' | 'medium' | 'large';
  variant?: 'primary' | 'secondary' | 'outlined' | 'quiet' | 'danger';
  children: ReactNode;
}

export function Button({
  children,
  className,
  disabled,
  loading = false,
  loadingLabel = 'Working...',
  size = 'medium',
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  const classes = ['ui-button', `ui-button--${variant}`, `ui-button--${size}`, className].filter(Boolean).join(' ');
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? loadingLabel : children}
    </button>
  );
}
