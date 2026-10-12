import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

import fs from 'fs';

function localApiPlugin() {
  return {
    name: 'local-api-handler',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: () => void) => {
        if (!req.url?.startsWith('/api/')) return next();

        const parsedUrl = new URL(req.url, 'http://localhost');
        const endpoint = parsedUrl.pathname.replace(/^\/api\//, '').split('/')[0];
        const filePath = path.resolve(import.meta.dirname, `api/${endpoint}.ts`);

        if (!fs.existsSync(filePath)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: `API route ${endpoint} not found` }));
          return;
        }

        try {
          if (['POST', 'PUT', 'PATCH'].includes(req.method || '')) {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
            const rawBody = Buffer.concat(chunks).toString('utf-8');
            try {
              req.body = rawBody ? JSON.parse(rawBody) : {};
            } catch {
              req.body = {};
            }
          } else {
            req.body = {};
          }

          req.query = Object.fromEntries(parsedUrl.searchParams);

          res.status = (code: number) => {
            res.statusCode = code;
            return res;
          };
          res.json = (data: any) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
            return res;
          };

          const mod = await server.ssrLoadModule(filePath);
          if (typeof mod.default === 'function') {
            await mod.default(req, res);
          } else {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Handler does not export default function' }));
          }
        } catch (err: any) {
          console.error(`[Local API Error] /api/${endpoint}:`, err);
          if (!res.headersSent) {
            res.statusCode = err?.status || 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err?.message || 'Internal server error' }));
          }
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), localApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
