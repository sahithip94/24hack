/**
 * Shared helpers for labelling which model produced an AI summary.
 * The backend marks deterministic local summaries with these sentinel
 * model names so the UI can distinguish them from real LLM output.
 */
export const LOCAL_FALLBACK_MODELS = new Set([
  'local-fallback-no-llm',
  'local-fallback-llm-error',
]);

export const isLocalFallback = (model?: string): boolean =>
  !model || LOCAL_FALLBACK_MODELS.has(model);