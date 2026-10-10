import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const nodeEnv = process.env.NODE_ENV || 'development';

export const config = {
  port: Number(process.env.PORT) || 8787,
  dataFile:
    process.env.DATA_FILE ||
    join(process.cwd(), 'data', 'medivault.json'),
  uploadsDir:
    process.env.UPLOADS_DIR ||
    join(process.cwd(), 'data', 'uploads'),
  nodeEnv,
  isProduction: nodeEnv === 'production',
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES) || 10 * 1024 * 1024,
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  guestSessionTtlMs: 12 * 60 * 60 * 1000, // 12 hours
  allowedShareExpirySeconds: [3600, 86400, 604800] as const, // 1 hour, 24 hours, 7 days
  shareVerify: {
    maxAttempts: 10,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
  // Optional: when set, /api/ai/summary can call an OpenAI-compatible chat
  // completions endpoint (record titles/categories only, never file contents).
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
};

// Ensure persistence directories exist at startup.
for (const target of [config.dataFile, config.uploadsDir]) {
  const parent = dirname(target);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
}
