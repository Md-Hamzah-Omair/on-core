import {
  isEmbeddingWorkerResponse,
  type EmbeddingWorkerResponse,
  type EmbeddingWorkerResult,
  type EmbeddingWorkItem,
} from './embedding-messages';
import { EMBEDDING_MODEL_ID, EMBEDDING_MODEL_REVISION, isValidEmbedding } from './embeddings';

export interface EmbeddingWorkerLike {
  onerror: ((event: ErrorEvent) => void) | null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

export type EmbeddingWorkerFactory = () => EmbeddingWorkerLike;

type PendingRequest = {
  resolve: () => void;
  reject: (error: Error) => void;
  type: 'INITIALIZE';
} | {
  items: EmbeddingWorkItem[];
  resolve: (value: EmbeddingWorkerResult[]) => void;
  reject: (error: Error) => void;
  type: 'EMBED_BATCH';
} | {
  reject: (error: Error) => void;
  resolve: (value: Float32Array) => void;
  type: 'EMBED_QUERY';
};

export class EmbeddingClient {
  private initialized = false;
  private initializationPromise: Promise<void> | undefined;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly worker: EmbeddingWorkerLike;

  constructor(
    createWorker: EmbeddingWorkerFactory,
    private readonly onStatus: (status: 'loading-model' | 'ready') => void = () => {},
  ) {
    this.worker = createWorker();
    this.worker.onmessage = (event) => this.handleMessage(event.data);
    this.worker.onerror = () => this.failAll(new Error('Embedding worker stopped unexpectedly.'));
  }

  async initialize(modelBaseUrl: string, wasmBaseUrl: string): Promise<void> {
    if (this.initialized) return;
    if (!this.initializationPromise) {
      const requestId = crypto.randomUUID();
      this.initializationPromise = new Promise<void>((resolve, reject) => {
        this.pending.set(requestId, { reject, resolve, type: 'INITIALIZE' });
        this.worker.postMessage({
          modelBaseUrl,
          requestId,
          type: 'INITIALIZE',
          version: 1,
          wasmBaseUrl,
        });
      }).then(() => {
        this.initialized = true;
      }).catch((error: unknown) => {
        this.initializationPromise = undefined;
        throw error;
      });
    }
    await this.initializationPromise;
  }

  async embedQuery(text: string): Promise<Float32Array> {
    if (!this.initialized) throw new Error('Embedding worker has not been initialized.');
    if (!text.trim()) throw new Error('Query text is empty.');
    const requestId = crypto.randomUUID();
    return new Promise<Float32Array>((resolve, reject) => {
      this.pending.set(requestId, { reject, resolve, type: 'EMBED_QUERY' });
      this.worker.postMessage({
        modelId: EMBEDDING_MODEL_ID,
        modelRevision: EMBEDDING_MODEL_REVISION,
        requestId,
        text,
        type: 'EMBED_QUERY',
        version: 1,
      });
    });
  }

  async embedBatch(items: EmbeddingWorkItem[]): Promise<EmbeddingWorkerResult[]> {
    if (!this.initialized) throw new Error('Embedding worker has not been initialized.');
    if (items.length === 0) return [];

    const requestId = crypto.randomUUID();
    return new Promise<EmbeddingWorkerResult[]>((resolve, reject) => {
      this.pending.set(requestId, { items, reject, resolve, type: 'EMBED_BATCH' });
      this.worker.postMessage({
        items,
        modelId: EMBEDDING_MODEL_ID,
        modelRevision: EMBEDDING_MODEL_REVISION,
        requestId,
        type: 'EMBED_BATCH',
        version: 1,
      });
    });
  }

  dispose() {
    this.worker.terminate();
    this.failAll(new Error('Embedding worker was disposed.'));
  }

  private failAll(error: Error) {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }

  private handleMessage(value: unknown) {
    if (!isEmbeddingWorkerResponse(value)) {
      const requestId = value && typeof value === 'object' ? (value as Record<string, unknown>).requestId : undefined;
      if (typeof requestId === 'string') {
        const request = this.pending.get(requestId);
        if (request) {
          this.pending.delete(requestId);
          request.reject(new Error('Embedding worker returned an invalid response.'));
        }
      }
      return;
    }
    const response = value as EmbeddingWorkerResponse;
    const request = this.pending.get(response.requestId);
    if (!request) return;

    if (response.type === 'STATUS') {
      this.onStatus(response.status);
      if (request.type === 'INITIALIZE' && response.status === 'ready') {
        this.pending.delete(response.requestId);
        request.resolve();
      }
      return;
    }

    if (response.type === 'ERROR') {
      this.pending.delete(response.requestId);
      request.reject(new Error(response.errorCode));
      return;
    }

    if (response.type === 'QUERY_RESULT') {
      if (request.type !== 'EMBED_QUERY' || !isValidEmbedding(response.embedding)) {
        this.pending.delete(response.requestId);
        request.reject(new Error('Embedding worker returned an invalid query response.'));
        return;
      }
      this.pending.delete(response.requestId);
      request.resolve(response.embedding);
      return;
    }

    if (request.type !== 'EMBED_BATCH' || !this.isValidBatchResult(response, request.items)) {
      this.pending.delete(response.requestId);
      request.reject(new Error('Embedding worker returned an invalid batch response.'));
      return;
    }

    this.pending.delete(response.requestId);
    request.resolve(response.results);
  }

  private isValidBatchResult(response: Extract<EmbeddingWorkerResponse, { type: 'BATCH_RESULT' }>, items: EmbeddingWorkItem[]) {
    if (response.results.length !== items.length) return false;

    const unmatched = new Set(items.map((item) => `${item.pageId}:${item.position}:${item.contentRevision}`));
    return response.results.every((result) => {
      const key = `${result.pageId}:${result.position}:${result.contentRevision}`;
      const request = items.find((item) => (
        item.pageId === result.pageId
        && item.position === result.position
        && item.contentRevision === result.contentRevision
      ));
      if (!request || !unmatched.delete(key)) return false;
      return !result.ok || isValidEmbedding(result.embedding);
    }) && unmatched.size === 0;
  }
}
