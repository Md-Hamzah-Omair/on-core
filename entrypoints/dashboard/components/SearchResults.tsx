import { Badge } from '../../../components/Badge';
import { Card } from '../../../components/Card';
import { Skeleton } from '../../../components/Skeleton';
import { Tooltip } from '../../../components/Tooltip';
import { formatSavedDate, hybridRelevanceLabel, relevanceExplanation, safeHostname, safePageUrl, savedDateTime } from '../../../lib/dashboard-state';
import type { SemanticSearchResult } from '../../../lib/semantic-search';

interface SearchResultsProps {
  isLoading: boolean;
  results: SemanticSearchResult[];
  showNoResults: boolean;
  summary: string;
}

export function SearchResults({ isLoading, results, showNoResults, summary }: SearchResultsProps) {
  if (!isLoading && results.length === 0 && !showNoResults) return null;
  return (
    <section className="results-section" aria-labelledby="results-heading" aria-busy={isLoading}>
      <div className="section-heading-row">
        <div><p className="section-kicker">Local matches</p><h2 id="results-heading">Search results</h2></div>
        {summary && <p className="result-summary" role="status">{summary}</p>}
      </div>
      {isLoading ? (
        <div className="results-grid" aria-label="Loading search results">
          {[0, 1, 2].map((item) => <Card key={item} className="result-card skeleton-card"><Skeleton height="1rem" width="35%" /><Skeleton height="1.6rem" width="80%" /><Skeleton height="4.5rem" /></Card>)}
        </div>
      ) : results.length ? (
        <div className="results-grid">
          {results.map((result) => {
            const url = safePageUrl(result.url);
            const dateTime = savedDateTime(result.savedAt);
            const title = url ? <a href={url} target="_blank" rel="noreferrer" aria-label={`${result.title}, open original in a new tab`}>{result.title}</a> : result.title;
            return (
              <Card key={result.pageId} className="result-card">
                <header className="card-header">
                  <span className="source-pill">{safeHostname(result.url)}</span>
                  <span className="relevance-row"><Badge tone={result.score >= 0.65 ? 'success' : 'accent'}>{hybridRelevanceLabel(result.score)}</Badge><Tooltip content={relevanceExplanation()}><button type="button" className="tooltip-trigger" aria-label="How relevance is determined">?</button></Tooltip></span>
                </header>
                <h3 className="card-title">{title}</h3>
                <p className="card-snippet result-snippet">{result.snippet}</p>
                <footer className="result-footer">
                  {dateTime ? <time dateTime={dateTime}>{formatSavedDate(result.savedAt)}</time> : <span>Unknown save date</span>}
                  {url ? <a className="open-original" href={url} target="_blank" rel="noreferrer">Open page <span aria-hidden="true">↗</span><span className="ui-visually-hidden">in a new tab</span></a> : <span className="unavailable-link">Original URL unavailable</span>}
                </footer>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="empty-state"><h3>No relevant matches found</h3><p>Try a different description, an exact phrase, or wait for pages to finish indexing.</p></Card>
      )}
    </section>
  );
}
