import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button';

export interface ConfirmDialogProps {
  cancelLabel?: string;
  children?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  description?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
}

export function ConfirmDialog({
  cancelLabel = 'Cancel',
  children,
  confirmLabel = 'Confirm',
  danger = false,
  description,
  loading = false,
  onCancel,
  onConfirm,
  open,
  title,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    }
  }, [open]);

  useEffect(() => () => {
    previousFocusRef.current?.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="ui-dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!loading) onCancel();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {description && <p id={descriptionId}>{description}</p>}
      {children}
      <div className="ui-dialog__actions">
        <Button variant="secondary" disabled={loading} onClick={onCancel}>{cancelLabel}</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </dialog>
  );
}
