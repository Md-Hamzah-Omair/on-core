import { browser } from 'wxt/browser';
import { extractPageContent } from '../lib/page-extraction';
import { canonicalizeUrl } from '../lib/pages';
import type { ExtractedPageMessage } from '../lib/messages';

export default defineUnlistedScript(() => {
  try {
    const rawUrl = window.location.href;
    const url = canonicalizeUrl(rawUrl);
    const extracted = extractPageContent(document);

    const message: ExtractedPageMessage = {
      type: 'PAGE_EXTRACTED',
      version: 2,
      payload: {
        ...extracted,
        url,
      },
    };

    void browser.runtime.sendMessage(message);
  } catch {
    // The background reports capture failures to the popup without exposing page content.
  }
});
