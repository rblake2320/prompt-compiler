import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/proxy/anthropic': {
          target: 'https://api.anthropic.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/proxy\/anthropic/, ''),
          headers: {
            'x-api-key': env.ANTHROPIC_API_KEY || '',
            'anthropic-version': '2023-06-01',
          },
        },
        '/api/proxy/openai': {
          target: 'https://api.openai.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/proxy\/openai/, ''),
          ...(env.OPENAI_API_KEY && {
            headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
          }),
        },
        '/api/proxy/groq': {
          target: 'https://api.groq.com',
          changeOrigin: true,
          // rewrite strips /api/proxy/groq and prepends /openai (Groq's base path)
          rewrite: (p) => p.replace(/^\/api\/proxy\/groq/, '/openai'),
          ...(env.GROQ_API_KEY && {
            headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
          }),
        },
      },
    },
  };
});
