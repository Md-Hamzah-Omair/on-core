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
    name: 'On-Core',
    short_name: 'On-Core',
    description: 'Private, on-device search for the web you choose to remember.',
    permissions: ['activeTab', 'scripting', 'offscreen', 'storage'],
    host_permissions: [],
    content_security_policy: {
      extension_pages: "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'",
    },
  },
});
