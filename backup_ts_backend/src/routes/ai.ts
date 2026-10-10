import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../config.js';
import { ApiError, asyncHandler, requireAuth, type AuthRequest } from '../middleware.js';
import { store } from '../store.js';
import type { RecordMeta } from '../types.js';

export const aiRouter = Router();

export interface DemoSummary {
  mode: 'demo';
  disclaimer: string;
  generatedAt: string;
  recordCount: number;
  categoryBreakdown: Array<{ category: string; count: number }>;
  fileTypeBreakdown: Array<{ fileType: string; count: number }>;
  dateRange: { earliest: string | null; latest: string | null };
  recentRecords: Array<Pick<RecordMeta, 'id' | 'title' | 'category' | 'recordDate' | 'fileName'>>;
}

export interface ProviderSummary {
  mode: 'provider';
  model: string;
  generatedAt: string;
  sourceRecordIds: string[];
  summary: string;
}

function buildDemoSummary(records: RecordMeta[]): DemoSummary {
  const categoryCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const r of records) {
    categoryCounts.set(r.category, (categoryCounts.get(r.category) ?? 0) + 1);
    typeCounts.set(r.fileType, (typeCounts.get(r.fileType) ?? 0) + 1);
    if (earliest === null || r.recordDate < earliest) earliest = r.recordDate;
    if (latest === null || r.recordDate > latest) latest = r.recordDate;
  }

  return {
    mode: 'demo',
    disclaimer:
      'Demo mode: no AI provider is configured on the server. This overview was generated locally from your record metadata (titles, categories, dates, file types) only. No medical document content was read or analyzed, and no diagnoses, medicines, or results are inferred.',
    generatedAt: new Date().toISOString(),
    recordCount: records.length,
    categoryBreakdown: [...categoryCounts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    fileTypeBreakdown: [...typeCounts.entries()]
      .map(([fileType, count]) => ({ fileType, count }))
      .sort((a, b) => b.count - a.count),
    dateRange: { earliest, latest },
    recentRecords: [...records]
      .sort((a, b) => b.recordDate.localeCompare(a.recordDate))
      .slice(0, 5)
      .map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        recordDate: r.recordDate,
        fileName: r.fileName,
      })),
  };
}

/** Whether an AI provider is configured (and therefore which mode is active). */
aiRouter.get(
  '/status',
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      providerConfigured: Boolean(config.openaiApiKey),
      mode: config.openaiApiKey ? 'provider' : 'demo',
    });
  }),
);

/**
 * Summarize the signed-in user's records. Only metadata the user owns is used.
 * Without an AI provider key, returns a clearly-labelled demo summary built
 * strictly from record metadata - never invented medical facts.
 */
aiRouter.post(
  '/summary',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { recordIds } = req.body ?? {};
    const owned = store.recordsForUser(req.user!.id);

    let records: RecordMeta[];
    if (Array.isArray(recordIds) && recordIds.length > 0) {
      const requested = new Set(recordIds.filter((id): id is string => typeof id === 'string'));
      records = owned.filter((r) => requested.has(r.id));
      if (records.length === 0) {
        throw new ApiError(400, 'None of the selected records were found in your account.', 'VALIDATION', {
          recordIds: 'None of the selected records were found in your account.',
        });
      }
    } else {
      records = owned;
    }

    if (records.length === 0) {
      throw new ApiError(400, 'Upload some records first, then generate a summary.', 'NO_RECORDS');
    }

    // A real provider (optional) receives metadata only - never file contents.
    if (config.openaiApiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.openaiApiKey}`,
          },
          body: JSON.stringify({
            model: config.openaiModel,
            messages: [
              {
                role: 'system',
                content:
                  'You summarize medical record metadata for a patient. Use only the provided metadata. Never invent diagnoses, medicines, or results. If information is not present, say so.',
              },
              {
                role: 'user',
                content: `Summarize these ${records.length} records: ${JSON.stringify(
                  records.map((r) => ({
                    title: r.title,
                    category: r.category,
                    recordDate: r.recordDate,
                    fileType: r.fileType,
                  })),
                )}`,
              },
            ],
          }),
        });
        if (response.ok) {
          const body = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const summary = body.choices?.[0]?.message?.content?.trim();
          if (summary) {
            const result: ProviderSummary = {
              mode: 'provider',
              model: config.openaiModel,
              generatedAt: new Date().toISOString(),
              sourceRecordIds: records.map((r) => r.id),
              summary,
            };
            res.json(result);
            return;
          }
        }
        // Fall through to the demo summary if the provider call fails.
      } catch (err) {
        console.error('[ai] Provider call failed, falling back to demo summary:', err);
      }
    }

    res.json(buildDemoSummary(records));
  }),
);
