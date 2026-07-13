import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifestVersion: 3,
  vite: () => ({
    resolve: {
      alias: [{ find: /^onnxruntime-web\/webgpu$/, replacement: 'onnxruntime-web/wasm' }],
      conditions: ['onnxruntime-web-use-extern-wasm'],
    },
  }),
  manifest: {
    name: 'Local Web Memory',
    description: 'A private, local-first memory for the web.',
    permissions: ['activeTab', 'scripting', 'offscreen'],
    host_permissions: [],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self'",
    },
  },
});
