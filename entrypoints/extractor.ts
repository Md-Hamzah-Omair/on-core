import { browser } from 'wxt/browser';
import { canonicalizeUrl, normalizeWhitespace, truncateText } from '../lib/pages';
import type { ExtractedPageMessage } from '../lib/messages';

export default defineUnlistedScript(() => {
  try {
    const title = document.title ? document.title.trim() : 'Untitled Page';
    const rawUrl = window.location.href;
    const bodyText = document.body ? document.body.innerText : '';

    const url = canonicalizeUrl(rawUrl);
    const cleanText = normalizeWhitespace(bodyText);
    const { text, truncated } = truncateText(cleanText);

    const message: ExtractedPageMessage = {
      type: 'PAGE_EXTRACTED',
      version: 1,
      payload: {
        title: title || 'Untitled Page',
        url,
        text,
        truncated,
      },
    };

    void browser.runtime.sendMessage(message);
  } catch {
    // The background reports capture failures to the popup without exposing page content.
  }
});
