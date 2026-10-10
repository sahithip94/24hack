import express from 'express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { corsMiddleware, errorHandler } from './middleware.js';
import { store } from './store.js';
import { authRouter } from './routes/auth.js';
import { recordsRouter } from './routes/records.js';
import { guestShareRouter, sharesRouter } from './routes/shares.js';
import { aiRouter } from './routes/ai.js';

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(corsMiddleware);

// Prune expired sessions periodically.
store.pruneExpired();
setInterval(() => store.pruneExpired(), 60 * 60 * 1000).unref();

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'medivault-backend', time: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/records', recordsRouter);
app.use('/api/shares', sharesRouter);
// Public guest-access endpoints: /api/share/:token/...
app.use('/api', guestShareRouter);
app.use('/api/ai', aiRouter);

// In production, optionally serve the built frontend from the same server.
const frontendDist = join(process.cwd(), '..', 'frontend', 'dist');
if (config.isProduction && existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(join(frontendDist, 'index.html'));
  });
}

app.use(errorHandler);

export { app };

const isMainModule =
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  app.listen(config.port, () => {
    console.log(`[medivault] Backend listening on http://localhost:${config.port}`);
    console.log(`[medivault] Data file: ${config.dataFile}`);
    console.log(`[medivault] Uploads: ${config.uploadsDir}`);
    if (!config.openaiApiKey) {
      console.log('[medivault] No OPENAI_API_KEY set - AI summaries run in demo mode.');
    }
    if (config.isProduction) {
      console.log('[medivault] Production mode: secure cookies enabled.');
    }
  });
}
