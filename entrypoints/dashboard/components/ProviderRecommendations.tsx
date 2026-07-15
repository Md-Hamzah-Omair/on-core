import { Badge } from '../../../components/Badge';
import { Card } from '../../../components/Card';

export const PROVIDER_RECOMMENDATIONS = [
  { name: 'Proton Drive', category: 'Privacy-focused', privacyRecommended: true },
  { name: 'Tresorit', category: 'Privacy-focused', privacyRecommended: true },
  { name: 'Peergos', category: 'Privacy-focused', privacyRecommended: true },
  { name: 'Google Drive', category: 'Broad compatibility', privacyRecommended: false },
  { name: 'OneDrive', category: 'Broad compatibility', privacyRecommended: false },
  { name: 'Other file-storage provider', category: 'Broad compatibility', privacyRecommended: false },
] as const;

export function ProviderRecommendations() {
  return (
    <Card className="provider-recommendations" aria-labelledby="provider-recommendations-heading">
      <p className="section-kicker">Manual cloud copy</p>
      <h3 id="provider-recommendations-heading">Choose where to keep it</h3>
      <p>Upload the downloaded file manually. On-Core has no direct provider integration.</p>
      <div className="provider-grid">
        {PROVIDER_RECOMMENDATIONS.map((provider) => (
          <section className="provider-card" key={provider.name} aria-label={provider.name}>
            <div className="provider-card__heading">
              <strong>{provider.name}</strong>
              {provider.privacyRecommended && <Badge tone="accent">Privacy recommended</Badge>}
            </div>
            <span>{provider.category}</span>
            <ul>
              <li>Manual upload</li>
              <li>No direct integration</li>
              <li>Backup encrypted locally by On-Core</li>
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}
