export function searchErrorMessage(code: string): string {
  if (code === 'NO_INDEXED_CONTENT') return 'No indexed pages are available yet. Save a page or wait for indexing to finish.';
  if (code === 'MODEL_LOAD_FAILED') return 'The local model could not start. Retry indexing or search again.';
  if (code === 'SEARCH_CAPACITY_EXCEEDED') return 'This local dataset is too large for the current exact search limit.';
  if (code === 'SEARCH_CANCELED') return 'Search was replaced by a newer request.';
  return 'Local search could not be completed. Please try again.';
}

export function indexingErrorMessage(code: string | undefined): string {
  if (code === 'MODEL_LOAD_FAILED') return 'The local embedding model could not be loaded.';
  if (code === 'INVALID_VECTOR') return 'An invalid local embedding was discarded. Retry indexing.';
  if (code === 'INFERENCE_FAILED') return 'Local embedding generation failed. Retry indexing.';
  return code ? 'Indexing did not complete. Retry indexing.' : '';
}
