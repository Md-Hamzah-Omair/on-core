import { EmbeddingClient, type EmbeddingWorkerFactory } from '../../lib/embedding-client';
import {
  claimPendingEmbeddings,
  commitEmbeddingResults,
  hasPendingIndexingWork,
  markAllPendingEmbeddingsFailed,
  markEmbeddingItemsFailed,
  recoverInterruptedIndexing,
  setPagesIndexingPhase,
} from '../../lib/database';
import { EMBEDDING_DIMENSION } from '../../lib/embeddings';

export class IndexingController {
  private activePageIds: number[] = [];
  private client: EmbeddingClient;
  private running = false;

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
          await this.client.initialize(this.modelBaseUrl, this.wasmBaseUrl);
        } catch {
          await markAllPendingEmbeddingsFailed('MODEL_LOAD_FAILED');
          this.client.dispose();
          this.client = this.createClient();
          return;
        }

        try {
          await setPagesIndexingPhase(this.activePageIds, 'embedding');
          await commitEmbeddingResults(await this.client.embedBatch(items));
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
}
