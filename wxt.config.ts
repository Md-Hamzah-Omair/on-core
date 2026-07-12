import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifestVersion: 3,
  manifest: {
    name: 'Local Web Memory',
    description: 'A private, local-first memory for the web.',
    permissions: [],
    host_permissions: [],
  },
});
