import type { env as transformerEnv } from '@huggingface/transformers';

type TransformersEnvironment = typeof transformerEnv;

export function configureEmbeddingRuntime(
  runtime: TransformersEnvironment,
  modelBaseUrl: string,
  wasmBaseUrl: string,
): void {
  runtime.allowLocalModels = true;
  runtime.allowRemoteModels = false;
  runtime.useBrowserCache = false;
  runtime.useWasmCache = false;
  runtime.localModelPath = modelBaseUrl;

  const wasm = runtime.backends.onnx.wasm;
  if (!wasm) throw new Error('ONNX Runtime WASM backend is unavailable.');
  wasm.numThreads = 1;
  wasm.proxy = false;
  wasm.wasmPaths = {
    mjs: new URL('ort-wasm-simd-threaded.mjs', wasmBaseUrl).toString(),
    wasm: new URL('ort-wasm-simd-threaded.wasm', wasmBaseUrl).toString(),
  };
}
