import { Button } from './Button';

export interface ToastMessage {
  id: string;
  message: string;
  tone?: 'info' | 'success' | 'error';
}

export interface ToastRegionProps {
  label?: string;
  onDismiss: (id: string) => void;
  toasts: readonly ToastMessage[];
}

export function ToastRegion({ label = 'Notifications', onDismiss, toasts }: ToastRegionProps) {
  return (
    <section className="ui-toast-region" aria-label={label} aria-live="polite" aria-relevant="additions text">
      {toasts.map((toast) => (
        <div key={toast.id} className={['ui-toast', `ui-toast--${toast.tone ?? 'info'}`].join(' ')} role={toast.tone === 'error' ? 'alert' : 'status'}>
          <p>{toast.message}</p>
          <Button className="ui-toast__dismiss" variant="quiet" size="small" aria-label={`Dismiss notification: ${toast.message}`} onClick={() => onDismiss(toast.id)}>
            Dismiss
          </Button>
        </div>
      ))}
    </section>
  );
}
