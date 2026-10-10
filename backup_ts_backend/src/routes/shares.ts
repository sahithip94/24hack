import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../config.js';
import { hashSecret, newPin, newSalt, newToken, newUuid, verifySecret } from '../crypto.js';
import {
  ApiError,
  asyncHandler,
  requireAuth,
  requireGuestVerified,
  resolveShare,
  checkVerifyRateLimit,
  type AuthRequest,
} from '../middleware.js';
import { store } from '../store.js';
import type { RecordMeta, Share, ShareEvent, ShareEventType } from '../types.js';
import { isPastIsoDate } from '../validation.js';

export const sharesRouter = Router();
export const guestShareRouter = Router();

function shareUrl(token: string): string {
  return `${config.frontendUrl}/share/${token}`;
}

export type ShareStatus = 'active' | 'expired' | 'revoked';

export function shareStatus(share: Share, now: Date = new Date()): ShareStatus {
  if (share.revoked) return 'revoked';
  if (isPastIsoDate(share.expiresAt, now)) return 'expired';
  return 'active';
}

function recordTitles(share: Share): string[] {
  return share.recordIds
    .map((id) => store.recordById(id))
    .filter((r): r is RecordMeta => Boolean(r))
    .map((r) => r.title);
}

function toShareInfo(share: Share) {
  return {
    id: share.id,
    token: share.token,
    url: shareUrl(share.token),
    recipientLabel: share.recipientLabel,
    createdAt: share.createdAt,
    expiresAt: share.expiresAt,
    status: shareStatus(share),
    recordCount: share.recordIds.length,
    recordTitles: recordTitles(share),
    events: share.events,
  };
}

function logEvent(shareId: string, ip: string, type: ShareEventType, detail?: string): void {
  const share = store.shareById(shareId);
  if (!share) return;
  const event: ShareEvent = { at: new Date().toISOString(), ip, type, ...(detail ? { detail } : {}) };
  share.events.push(event);
  store.save();
}

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

/** Create a guest share for the exact selected records. */
sharesRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { recordIds, recipientLabel, expiresIn } = req.body ?? {};

    if (!Array.isArray(recordIds) || recordIds.length === 0) {
      throw new ApiError(400, 'Select at least one record to share.', 'VALIDATION', {
        recordIds: 'Select at least one record to share.',
      });
    }
    if (recordIds.length > 50) {
      throw new ApiError(400, 'You can share up to 50 records at once.', 'VALIDATION', {
        recordIds: 'You can share up to 50 records at once.',
      });
    }
    if (!Number.isInteger(expiresIn) || !(config.allowedShareExpirySeconds as readonly number[]).includes(expiresIn)) {
      throw new ApiError(400, 'Choose a valid expiry duration.', 'VALIDATION', {
        expiresIn: 'Choose 1 hour, 24 hours, or 7 days.',
      });
    }
    if (
      recipientLabel !== undefined &&
      recipientLabel !== null &&
      (typeof recipientLabel !== 'string' || recipientLabel.trim().length > 80)
    ) {
      throw new ApiError(400, 'Recipient label must be 80 characters or fewer.', 'VALIDATION', {
        recipientLabel: 'Recipient label must be 80 characters or fewer.',
      });
    }

    // Only records owned by the signed-in user may be shared.
    const owned = new Set(store.recordsForUser(req.user!.id).map((r) => r.id));
    const validIds = [...new Set(recordIds)].filter(
      (id): id is string => typeof id === 'string' && owned.has(id),
    );
    if (validIds.length === 0) {
      throw new ApiError(400, 'None of the selected records were found in your account.', 'VALIDATION', {
        recordIds: 'None of the selected records were found in your account.',
      });
    }

    const token = newToken(24);
    const pin = newPin();
    const pinSalt = newSalt();
    const share = store.addShare({
      id: newUuid(),
      token,
      userId: req.user!.id,
      recordIds: validIds,
      recipientLabel:
        typeof recipientLabel === 'string' && recipientLabel.trim()
          ? recipientLabel.trim()
          : null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      pinHash: hashSecret(pin, pinSalt),
      pinSalt: pinSalt.toString('hex'),
      revoked: false,
      events: [],
    });

    logEvent(share.id, clientIp(req), 'created');

    res.status(201).json({
      ...toShareInfo(share),
      // The PIN is returned only in this response. It must be
      // communicated to the recipient through a separate channel.
      pin,
    });
  }),
);

/** List the signed-in user's shares with status and activity. */
sharesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const shares = store.sharesForUser(req.user!.id).map(toShareInfo);
    res.json({ shares });
  }),
);

/** Revoke a share immediately (even if previously opened). */
sharesRouter.post(
  '/:id/revoke',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const share = store.shareById(req.params.id);
    if (!share || share.userId !== req.user!.id) {
      throw new ApiError(404, 'Share not found.', 'NOT_FOUND');
    }
    store.updateShare(share.id, { revoked: true });
    store.deleteGuestSessionsForShare(share.id);
    logEvent(share.id, clientIp(req), 'revoked', 'Owner revoked the share');
    res.json({ share: toShareInfo(store.shareById(share.id)!) });
  }),
);

/** Delete a share record entirely. */
sharesRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const share = store.shareById(req.params.id);
    if (!share || share.userId !== req.user!.id) {
      throw new ApiError(404, 'Share not found.', 'NOT_FOUND');
    }
    store.deleteGuestSessionsForShare(share.id);
    store.deleteShare(share.id);
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Public guest endpoints (no MediVault account required)
// ---------------------------------------------------------------------------

/**
 * Check whether a share token is usable. Returns NO record names,
 * metadata or file contents at this stage.
 */
guestShareRouter.get(
  '/share/:token/meta',
  asyncHandler(async (req: Request, res: Response) => {
    const share = resolveShare(req);
    res.json({
      tokenValid: true,
      requiresPin: true,
      expiresAt: share.expiresAt,
    });
  }),
);

/** Verify the share PIN/OTP. Rate-limited; sets a guest session cookie. */
guestShareRouter.post(
  '/share/:token/verify',
  asyncHandler(async (req: Request, res: Response) => {
    const share = resolveShare(req);

    const limit = checkVerifyRateLimit(share);
    if (!limit.ok) {
      logEvent(share.id, clientIp(req), 'verify_failed', 'rate limited');
      throw new ApiError(
        429,
        `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.`,
        'RATE_LIMITED',
      );
    }

    const { pin } = req.body ?? {};
    if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
      logEvent(share.id, clientIp(req), 'verify_failed', 'malformed pin');
      throw new ApiError(400, 'Enter the 6-digit PIN.', 'VALIDATION', {
        pin: 'Enter the 6-digit PIN.',
      });
    }

    const matches = verifySecret(pin, share.pinSalt, share.pinHash);

    if (!matches) {
      logEvent(share.id, clientIp(req), 'verify_failed');
      const windowStart = Date.now() - config.shareVerify.windowMs;
      const recent = share.events.filter(
        (e) => e.type === 'verify_failed' && new Date(e.at).getTime() >= windowStart,
      );
      throw new ApiError(
        401,
        'Incorrect PIN. Please try again.',
        'INVALID_PIN',
        { attemptsRemaining: String(Math.max(0, config.shareVerify.maxAttempts - recent.length)) },
      );
    }

    const guestToken = newToken();
    store.addGuestSession({
      token: guestToken,
      shareId: share.id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(
        Math.min(Date.now() + config.guestSessionTtlMs, new Date(share.expiresAt).getTime()),
      ).toISOString(),
    });
    logEvent(share.id, clientIp(req), 'verify_success');

    res.cookie('mv_guest', guestToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: config.guestSessionTtlMs,
      path: '/',
    });
    res.json({ ok: true, expiresAt: share.expiresAt });
  }),
);

/** List the records authorized by a verified share. */
guestShareRouter.get(
  '/share/:token/records',
  requireGuestVerified,
  asyncHandler(async (req: Request, res: Response) => {
    const share = (req as AuthRequest).share!;
    const records = share.recordIds
      .map((id) => store.recordById(id))
      .filter((r): r is RecordMeta => !!r && r.userId === share.userId);
    logEvent(share.id, clientIp(req), 'view');
    res.json({
      share: {
        recipientLabel: share.recipientLabel,
        expiresAt: share.expiresAt,
      },
      records,
    });
  }),
);

/** Open a file authorized by a verified share. */
guestShareRouter.get(
  '/share/:token/records/:recordId/file',
  requireGuestVerified,
  asyncHandler(async (req: Request, res: Response) => {
    const share = (req as AuthRequest).share!;
    const recordId = req.params.recordId as string;

    // Defense in depth: the record must be explicitly listed in the
    // share AND owned by the share owner. A guest cannot tamper with
    // the URL to reach another record.
    if (!share.recordIds.includes(recordId)) {
      throw new ApiError(404, 'Record not found in this share.', 'NOT_FOUND');
    }
    const record = store.recordById(recordId);
    if (!record || record.userId !== share.userId) {
      throw new ApiError(404, 'Record not found in this share.', 'NOT_FOUND');
    }

    const path = join(config.uploadsDir, record.storagePath);
    if (!existsSync(path)) {
      throw new ApiError(404, 'The file for this record is no longer available.', 'FILE_MISSING');
    }
    logEvent(share.id, clientIp(req), 'file_open', record.id);
    res.setHeader('Content-Type', record.fileType);
    res.setHeader('Content-Disposition', `inline; filename="${record.fileName}"`);
    createReadStream(path).pipe(res);
  }),
);
