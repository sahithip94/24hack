import type { Request, Response, NextFunction } from 'express';
import { config } from './config.js';
import { store } from './store.js';
import { isPastIsoDate } from './validation.js';
import type { Share, User } from './types.js';

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor(
    status: number,
    message: string,
    code = 'ERROR',
    fields?: Record<string, string>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const asyncHandler =
  (
    fn: (
      req: Request,
      res: Response,
      next: NextFunction,
    ) => Promise<void>,
  ) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

function getSessionCookie(req: Request): string | undefined {
  return req.cookies?.mv_session;
}

function getGuestCookie(req: Request): string | undefined {
  return req.cookies?.mv_guest;
}

export interface AuthRequest extends Request {
  user?: User;
  share?: Share;
}

/** Require a valid logged-in session. */
export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const token = getSessionCookie(req);
  const session = token ? store.sessionByToken(token) : undefined;
  if (!session || isPastIsoDate(session.expiresAt)) {
    throw new ApiError(401, 'You must be signed in to access this resource.', 'UNAUTHORIZED');
  }
  const user = store.userById(session.userId);
  if (!user) {
    throw new ApiError(401, 'Session is no longer valid.', 'UNAUTHORIZED');
  }
  (req as AuthRequest).user = user;
  next();
}

export interface GuestContext {
  share: Share;
}

/**
 * Resolve a share from a URL token without revealing any medical data.
 * Throws 404 for unknown tokens and 410 for expired/revoked shares.
 */
export function resolveShare(req: Request): Share {
  const token = req.params.token as string;
  const share = store.shareByToken(token);
  if (!share) {
    throw new ApiError(404, 'This share link is invalid.', 'NOT_FOUND');
  }
  if (share.revoked) {
    throw new ApiError(410, 'This share link has been revoked by the sender.', 'REVOKED');
  }
  if (isPastIsoDate(share.expiresAt)) {
    throw new ApiError(410, 'This share link has expired.', 'EXPIRED');
  }
  return share;
}

/**
 * Require a verified guest session for the share in the URL.
 * The guest session only proves "this device passed the PIN check";
 * share state (expiry/revocation) is re-validated on every request.
 */
export function requireGuestVerified(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const share = resolveShare(req);
  const token = getGuestCookie(req);
  const guest = token ? store.guestSessionByToken(token) : undefined;
  if (!guest || guest.shareId !== share.id || isPastIsoDate(guest.expiresAt)) {
    throw new ApiError(401, 'Guest verification required.', 'GUEST_VERIFICATION_REQUIRED');
  }
  (req as AuthRequest).share = share;
  next();
}

/**
 * Per-share verification attempt rate limiting, persisted so it survives
 * restarts. Failed attempts are pruned after the configured window.
 */
export function checkVerifyRateLimit(share: Share): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const windowStart = now - config.shareVerify.windowMs;
  const recent = share.events.filter(
    (e) =>
      e.type === 'verify_failed' &&
      new Date(e.at).getTime() >= windowStart,
  );
  if (recent.length >= config.shareVerify.maxAttempts) {
    const oldest = Math.min(...recent.map((e) => new Date(e.at).getTime()));
    const retryAfterSeconds = Math.ceil(
      (oldest + config.shareVerify.windowMs - now) / 1000,
    );
    return { ok: false, retryAfterSeconds };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

/** Minimal CORS for development (frontend on a different port). */
export function corsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const origin = req.headers.origin;
  if (origin && origin === config.frontendUrl) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization',
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

/** Central error handler: no internals or user data leaked to the client. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      message: err.message,
      code: err.code,
      ...(err.fields ? { fields: err.fields } : {}),
    });
    return;
  }
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ message: 'An unexpected error occurred.', code: 'INTERNAL' });
}
