import { browser } from 'wxt/browser';
import { canonicalizeUrl, normalizePageTitle } from '../lib/pages';
import { cleanAndTruncatePageText } from '../lib/text-cleaning';
import type { ExtractedPageMessage } from '../lib/messages';

export default defineUnlistedScript(() => {
  try {
    const title = normalizePageTitle(document.title) || 'Untitled Page';
    const rawUrl = window.location.href;
    const bodyText = document.body ? document.body.innerText : '';

    const url = canonicalizeUrl(rawUrl);
    const { text, truncated } = cleanAndTruncatePageText(bodyText);

    const message: ExtractedPageMessage = {
      type: 'PAGE_EXTRACTED',
      version: 1,
      payload: {
        title,
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
