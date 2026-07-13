import { describe, expect, it } from 'vitest';
import { configureEmbeddingRuntime } from './embedding-runtime';

describe('embedding runtime configuration', () => {
  it('configures local, single-threaded WASM before pipeline creation', () => {
    const onnx = { wasm: {} };
    const runtime = {
      allowLocalModels: false,
      allowRemoteModels: true,
      backends: { onnx },
      localModelPath: '',
      useBrowserCache: true,
      useWasmCache: true,
    } as Parameters<typeof configureEmbeddingRuntime>[0];

    configureEmbeddingRuntime(runtime, 'chrome-extension://id/models/', 'chrome-extension://id/wasm/');

    expect(runtime.backends.onnx).toBe(onnx);
    expect(runtime.allowLocalModels).toBe(true);
    expect(runtime.allowRemoteModels).toBe(false);
    expect(runtime.useBrowserCache).toBe(false);
    expect(runtime.useWasmCache).toBe(false);
    expect(runtime.localModelPath).toBe('chrome-extension://id/models/');
    expect(runtime.backends.onnx.wasm).toMatchObject({
      numThreads: 1,
      proxy: false,
      wasmPaths: {
        mjs: 'chrome-extension://id/wasm/ort-wasm-simd-threaded.mjs',
        wasm: 'chrome-extension://id/wasm/ort-wasm-simd-threaded.wasm',
      },
    });
  });
});
