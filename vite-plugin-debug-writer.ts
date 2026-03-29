import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const DEBUG_DIR = 'debug-logs';

export function debugWriterPlugin(): Plugin {
  const root = process.cwd();
  const debugRoot = path.join(root, DEBUG_DIR);

  return {
    name: 'qualia-debug-writer',
    configureServer(server) {
      // POST /api/debug/write — write a file to debug-logs/{session}/{filename}
      server.middlewares.use('/api/debug/write', (req, res, next) => {
        if (req.method !== 'POST') { next(); return; }

        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const { session, filename, content, encoding } = JSON.parse(body) as {
              session: string;
              filename: string;
              content: string;
              encoding?: 'base64' | 'utf-8';
            };

            if (!session || !filename) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'session and filename required' }));
              return;
            }

            // Sanitize path components
            const safeSession = session.replace(/[^a-zA-Z0-9_-]/g, '_');
            const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
            const dir = path.join(debugRoot, safeSession);
            fs.mkdirSync(dir, { recursive: true });

            const filePath = path.join(dir, safeFilename);
            const buffer = encoding === 'base64'
              ? Buffer.from(content, 'base64')
              : content;

            fs.writeFileSync(filePath, buffer);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: `${DEBUG_DIR}/${safeSession}/${safeFilename}` }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(e) }));
          }
        });
      });

      // GET /api/debug/sessions — list session folders
      server.middlewares.use('/api/debug/sessions', (req, res, next) => {
        if (req.method !== 'GET') { next(); return; }

        try {
          if (!fs.existsSync(debugRoot)) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify([]));
            return;
          }
          const sessions = fs.readdirSync(debugRoot, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name)
            .sort()
            .reverse();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(sessions));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(e) }));
        }
      });

      // Static serve debug-logs/ at /debug-logs/
      server.middlewares.use(`/${DEBUG_DIR}`, (req, res, next) => {
        const url = decodeURIComponent(req.url ?? '/');
        const filePath = path.join(debugRoot, url);

        // Prevent path traversal
        if (!filePath.startsWith(debugRoot)) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }

        if (!fs.existsSync(filePath)) {
          next();
          return;
        }

        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          // List directory contents as JSON
          const entries = fs.readdirSync(filePath);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(entries));
          return;
        }

        // Serve file
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.json': 'application/json',
          '.png': 'image/png',
          '.txt': 'text/plain',
        };
        res.setHeader('Content-Type', mimeTypes[ext] ?? 'application/octet-stream');
        fs.createReadStream(filePath).pipe(res);
      });
    },
  };
}
