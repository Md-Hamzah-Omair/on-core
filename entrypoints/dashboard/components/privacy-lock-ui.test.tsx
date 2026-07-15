// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: { getURL: (path: string) => path, onMessage: { addListener() {}, removeListener() {} }, sendMessage: vi.fn() },
    storage: { local: { get: vi.fn() }, session: { get: vi.fn() }, onChanged: { addListener() {}, removeListener() {} } },
    tabs: { create: vi.fn() },
  },
}));

vi.mock('../../../lib/use-privacy-lock', () => ({
  usePrivacyLock: () => ({
    autoLockMinutes: 15,
    config: {},
    loading: false,
    lock: vi.fn(),
    refresh: vi.fn(),
    reset: vi.fn(),
    setTimeoutMinutes: vi.fn(),
    setup: vi.fn(),
    status: 'locked',
    unlock: vi.fn(),
  }),
}));

import DashboardApp from '../App';
import PopupApp from '../../popup/App';
import { PrivacyLockScreen } from './PrivacyLockScreen';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  document.body.innerHTML = '';
});

describe('locked interface rendering', () => {
  it('does not render sensitive dashboard or popup controls while locked', () => {
    const dashboard = renderToStaticMarkup(<DashboardApp />);
    const popup = renderToStaticMarkup(<PopupApp />);

    expect(dashboard).toContain('On-Core is locked');
    expect(dashboard).not.toContain('Saved memories');
    expect(dashboard).not.toContain('Search your saved web');
    expect(dashboard).not.toContain('Download encrypted backup');
    expect(popup).toContain('On-Core is locked');
    expect(popup).not.toContain('Save Page');
    expect(popup).not.toContain('Readable text and metadata stay');
  });

  it('requires destructive confirmation before reset', async () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { Object.defineProperty(this, 'open', { configurable: true, value: true, writable: true }); } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { Object.defineProperty(this, 'open', { configurable: true, value: false, writable: true }); } });
    const reset = vi.fn(async () => {});
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<PrivacyLockScreen mode="locked" onResetData={reset} onSetup={async () => {}} onUnlock={async () => false} />));

    const forgot = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Forgot'))!;
    await act(async () => forgot.click());
    expect(reset).not.toHaveBeenCalled();
    const confirm = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Reset and delete'))!;
    await act(async () => confirm.click());
    expect(reset).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });

  it('shows a generic message for an incorrect password', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<PrivacyLockScreen mode="locked" onResetData={async () => {}} onSetup={async () => {}} onUnlock={async () => false} />));
    const input = container.querySelector<HTMLInputElement>('#privacy-lock-password')!;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      valueSetter?.call(input, 'incorrect local password');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Incorrect PIN or password.');
    await act(async () => root.unmount());
  });
});
