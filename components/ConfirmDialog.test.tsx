// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('ConfirmDialog', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('closes through native cancel semantics', async () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { Object.defineProperty(this, 'open', { configurable: true, value: true, writable: true }); } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { Object.defineProperty(this, 'open', { configurable: true, value: false, writable: true }); } });
    const container = document.createElement('div');
    document.body.append(container);
    function Harness() {
      const [open, setOpen] = useState(true);
      return <ConfirmDialog open={open} title="Delete?" description="Permanent action" onCancel={() => setOpen(false)} onConfirm={() => {}} />;
    }
    const root = createRoot(container);
    await act(async () => root.render(<Harness />));
    const dialog = container.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    await act(async () => dialog.dispatchEvent(new Event('cancel', { cancelable: true })));
    expect(dialog.open).toBe(false);
    await act(async () => root.unmount());
  });
});
