import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// L'API (backend Express) est servie sous /api, sur la même origine que l'application :
// le cookie de session (httpOnly, SameSite=Strict) et les événements temps réel fonctionnent sans CORS.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const cible = env.API_PROXY ?? 'http://localhost:4000';
  const proxy = { '/api': { target: cible, changeOrigin: false } };
  return {
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
  };
});
