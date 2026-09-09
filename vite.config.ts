import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    // No secret is ever inlined into the client bundle. `GEMINI_API_KEY` lives in
    // the server runtime only (ARCHITECTURE FREEZE → Gemini; ADR-008): the browser
    // reaches AI exclusively through the validated `/api` allowlist.
    define: {
      'process.env.NEURAL_CLIENT_RUNTIME': JSON.stringify('ai-studio-web-app'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // AI Studio (and any other reverse proxy, e.g. Cloud Run / IDX / sandbox
      // previews) serves this app from a generated host. Without this Vite
      // answers 403 "Blocked request. This host is not allowed." for every
      // request, so the app cannot be previewed or developed through the proxy.
      allowedHosts: true,
    },
  };
});
