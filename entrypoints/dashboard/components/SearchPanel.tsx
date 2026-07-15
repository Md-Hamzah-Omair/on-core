import type { FormEvent } from 'react';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Progress } from '../../../components/Progress';
import { SEARCH_RESULT_LIMIT_OPTIONS, type SearchResultLimit } from '../../../lib/ui-preferences';

interface SearchPanelProps {
  error: string;
  isSearching: boolean;
  limit: SearchResultLimit;
  onClear: () => void;
  onLimitChange: (limit: SearchResultLimit) => void;
  onQueryChange: (query: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  progressLabel: string;
  query: string;
  showClear: boolean;
}

export function SearchPanel({ error, isSearching, limit, onClear, onLimitChange, onQueryChange, onSubmit, progressLabel, query, showClear }: SearchPanelProps) {
  const descriptionIds = [isSearching ? 'search-progress-text' : '', error ? 'search-error' : ''].filter(Boolean).join(' ') || undefined;
  return (
    <Card className="search-panel" id="search">
      <div className="hero-copy">
        <p className="eyebrow">Your private knowledge space</p>
        <h1>Remember the web,<br /><em>your way.</em></h1>
        <p className="search-intro">Find a saved page by idea, exact wording, source, or the smallest detail. Search is processed entirely on this device.</p>
      </div>
      <form onSubmit={onSubmit} aria-busy={isSearching}>
        <label className="ui-visually-hidden" htmlFor="memory-search">Search your web memory</label>
        <div className="search-field-wrap">
          <span className="search-glyph" aria-hidden="true" />
          <input
            id="memory-search"
            className="search-input"
            type="search"
            maxLength={500}
            placeholder="What do you remember?"
            value={query}
            aria-describedby={descriptionIds}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
        <div className="search-actions">
          <Button type="submit" size="large">{isSearching ? 'Search again' : 'Search locally'}</Button>
          {showClear && <Button variant="outlined" size="large" onClick={onClear}>Clear search</Button>}
          <label className="result-limit-control" htmlFor="result-limit"><span>Results</span>
            <select id="result-limit" value={limit} onChange={(event) => onLimitChange(Number(event.target.value) as SearchResultLimit)}>
              {SEARCH_RESULT_LIMIT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>
        <div className="search-status-slot" aria-live="polite" aria-atomic="true">
          {isSearching && (
            <div className="search-processing">
              <Progress label={progressLabel} />
              <p id="search-progress-text">{progressLabel}</p>
            </div>
          )}
          {error && <p id="search-error" className="inline-error" role="alert">{error}</p>}
        </div>
      </form>
      <p className="hero-local-note"><span aria-hidden="true" />On-device search · No network requests</p>
    </Card>
  );
}
