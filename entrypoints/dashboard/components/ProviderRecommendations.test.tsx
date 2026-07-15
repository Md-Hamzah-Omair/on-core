// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PROVIDER_RECOMMENDATIONS, ProviderRecommendations } from './ProviderRecommendations';

describe('provider recommendations', () => {
  it('labels every provider as manual with no direct integration', () => {
    document.body.innerHTML = renderToStaticMarkup(<ProviderRecommendations />);
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.provider-card'));

    expect(cards).toHaveLength(6);
    expect(cards.map((card) => card.textContent)).toEqual(PROVIDER_RECOMMENDATIONS.map((provider) => expect.stringContaining(provider.name)));
    for (const card of cards) {
      expect(card.textContent).toContain('Manual upload');
      expect(card.textContent).toContain('No direct integration');
      expect(card.textContent).toContain('Backup encrypted locally by On-Core');
    }
  });

  it('reserves the privacy badge for the three approved cards', () => {
    document.body.innerHTML = renderToStaticMarkup(<ProviderRecommendations />);
    const badged = Array.from(document.querySelectorAll('.provider-card'))
      .filter((card) => card.textContent?.includes('Privacy recommended'))
      .map((card) => card.getAttribute('aria-label'));

    expect(badged).toEqual(['Proton Drive', 'Tresorit', 'Peergos']);
  });
});
