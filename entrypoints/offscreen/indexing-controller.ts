import { EmbeddingClient, type EmbeddingWorkerFactory } from '../../lib/embedding-client';
import {
  claimPendingEmbeddings,
  commitEmbeddingResults,
  getSemanticSearchCandidates,
  hasPendingIndexingWork,
  markAllPendingEmbeddingsFailed,
  markEmbeddingItemsFailed,
  recoverInterruptedIndexing,
  setPagesIndexingPhase,
} from '../../lib/database';
import { EMBEDDING_DIMENSION } from '../../lib/embeddings';
import { rankSemanticSearch, validateSearchQuery, validateSearchResultLimit, type SemanticSearchResult } from '../../lib/semantic-search';

export class IndexingController {
  private activePageIds: number[] = [];
  private client: EmbeddingClient;
  private running = false;
  private cancelledSearches = new Set<string>();
  private inference = Promise.resolve();

  constructor(
    private readonly createWorker: EmbeddingWorkerFactory,
    private readonly modelBaseUrl: string,
    private readonly wasmBaseUrl: string,
  ) {
    this.client = this.createClient();
  }

  async hasPendingWork(): Promise<boolean> {
    return hasPendingIndexingWork();
  }

  async runProbe(): Promise<{ dimension: number; norm: number }> {
    return this.withInference(async () => {
      await this.client.initialize(this.modelBaseUrl, this.wasmBaseUrl);
    const [result] = await this.client.embedBatch([{
      contentRevision: 1,
      pageId: 1,
      position: 0,
      text: 'Local embedding runtime probe.',
    }]);
    if (!result?.ok || result.embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(result?.ok === false ? result.message : 'Embedding probe returned an invalid result.');
    }

    let sumOfSquares = 0;
    for (const value of result.embedding) sumOfSquares += value * value;
      return { dimension: result.embedding.length, norm: Math.sqrt(sumOfSquares) };
    });
  }

  cancelSearch(requestId: string) {
    this.cancelledSearches.add(requestId);
  }

  async search(requestId: string, query: string, limit: number): Promise<{ results: SemanticSearchResult[]; status: 'no-indexed-content' | 'results' | 'no-results' }> {
    const validation = validateSearchQuery(query);
    if (!validation.valid || !validateSearchResultLimit(limit)) throw new Error('INVALID_QUERY');
    const candidates = await getSemanticSearchCandidates();
    if (candidates.length === 0) return { results: [], status: 'no-indexed-content' };
    if (this.cancelledSearches.delete(requestId)) throw new Error('SEARCH_CANCELED');
    const embedding = await this.withInference(async () => {
      if (this.cancelledSearches.delete(requestId)) throw new Error('SEARCH_CANCELED');
      await this.client.initialize(this.modelBaseUrl, this.wasmBaseUrl);
      return this.client.embedQuery(validation.normalized);
    });
    if (this.cancelledSearches.delete(requestId)) throw new Error('SEARCH_CANCELED');
    const results = rankSemanticSearch(embedding, validation.normalized, candidates, limit, Date.now());
    return { results, status: results.length ? 'results' : 'no-results' };
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      await recoverInterruptedIndexing();
      while (true) {
        const items = await claimPendingEmbeddings();
        if (items.length === 0) return;

        this.activePageIds = [...new Set(items.map((item) => item.pageId))];
        try {
          await this.withInference(() => this.client.initialize(this.modelBaseUrl, this.wasmBaseUrl));
        } catch {
          await markAllPendingEmbeddingsFailed('MODEL_LOAD_FAILED');
          this.client.dispose();
          this.client = this.createClient();
          return;
        }

        try {
          await setPagesIndexingPhase(this.activePageIds, 'embedding');
          await commitEmbeddingResults(await this.withInference(() => this.client.embedBatch(items)));
        } catch {
          await markEmbeddingItemsFailed(items, 'WORKER_FAILED');
          this.client.dispose();
          this.client = this.createClient();
          return;
        } finally {
          this.activePageIds = [];
        }
      }
    } finally {
      this.running = false;
    }
  }

  dispose() {
    this.client.dispose();
  }

  private createClient() {
    return new EmbeddingClient(this.createWorker, (status) => {
      if (status === 'loading-model' && this.activePageIds.length > 0) {
        void setPagesIndexingPhase(this.activePageIds, 'loading-model');
      }
    });
  }

  private async withInference<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.inference;
    let release!: () => void;
    this.inference = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}
