import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: '0.0.0.0' },
  // Keep syntax grammars lazy instead of inlining every language into one worker.
  worker: { format: 'es' },
  plugins: [
    sveltekit({
      adapter: adapter(),
      compilerOptions: { experimental: { async: true } },
      experimental: { remoteFunctions: true }
    })
  ]
});
