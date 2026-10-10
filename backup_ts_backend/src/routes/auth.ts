import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../config.js';
import { hashSecret, newSalt, newToken, newUuid, verifySecret } from '../crypto.js';
import {
  ApiError,
  asyncHandler,
  requireAuth,
  type AuthRequest,
} from '../middleware.js';
import { store } from '../store.js';
import { toPublicUser } from '../types.js';
import {
  isEmail,
  isValidFullName,
  normalizeEmail,
  passwordProblems,
} from '../validation.js';

export const authRouter = Router();

/** Sign up a new account. The account is usable immediately; no email verification is required. */
authRouter.post(
  '/signup',
  asyncHandler(async (req: Request, res: Response) => {
    const { fullName, email, password } = req.body ?? {};

    const fields: Record<string, string> = {};
    if (typeof fullName !== 'string' || !isValidFullName(fullName)) {
      fields.fullName = 'Enter your full name (2-100 characters).';
    }
    if (typeof email !== 'string' || !isEmail(email)) {
      fields.email = 'Enter a valid email address.';
    }
    if (typeof password !== 'string') {
      fields.password = 'Password is required.';
    } else {
      const problems = passwordProblems(password);
      if (problems.length > 0) {
        fields.password = `Password needs ${problems.join(', ')}.`;
      }
    }
    if (Object.keys(fields).length > 0) {
      throw new ApiError(400, 'Please fix the highlighted fields.', 'VALIDATION', fields);
    }

    const normalized = normalizeEmail(email);
    if (store.userByEmail(normalized)) {
      throw new ApiError(
        409,
        'An account with this email already exists. Try logging in.',
        'EMAIL_TAKEN',
        { email: 'An account with this email already exists.' },
      );
    }

    const salt = newSalt();
    const user = store.addUser({
      id: newUuid(),
      fullName: fullName.trim(),
      email: normalized,
      passwordHash: hashSecret(password, salt),
      salt: salt.toString('hex'),
      createdAt: new Date().toISOString(),
    });

    // The account is usable immediately: no verification email or token is
    // created, so the user can log in right away.
    res.status(201).json({
      user: toPublicUser(user),
      message: 'Account created. You can now log in with your email and password.',
    });
  }),
);

/** Log in. Credentials are checked normally; no email verification is required. */
authRouter.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || !isEmail(email)) {
      throw new ApiError(400, 'Enter a valid email address.', 'VALIDATION', {
        email: 'Enter a valid email address.',
      });
    }
    if (typeof password !== 'string' || password.length === 0) {
      throw new ApiError(400, 'Enter your password.', 'VALIDATION', {
        password: 'Enter your password.',
      });
    }

    const user = store.userByEmail(normalizeEmail(email));
    if (
      !user ||
      !verifySecret(password, user.salt, user.passwordHash)
    ) {
      throw new ApiError(401, 'Invalid email or password.', 'INVALID_CREDENTIALS');
    }

    store.deleteUserSessions(user.id);
    const sessionToken = newToken();
    store.addSession({
      token: sessionToken,
      userId: user.id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + config.sessionTtlMs).toISOString(),
    });

    res.cookie('mv_session', sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: config.sessionTtlMs,
      path: '/',
    });
    res.json({ user: toPublicUser(user) });
  }),
);

/** Get the current signed-in user. */
authRouter.get(
  '/me',
  asyncHandler(async (req: Request, res: Response) => {
    const token = req.cookies?.mv_session;
    const session = token ? store.sessionByToken(token) : undefined;
    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
      throw new ApiError(401, 'Not signed in.', 'UNAUTHORIZED');
    }
    const user = store.userById(session.userId);
    if (!user) {
      throw new ApiError(401, 'Not signed in.', 'UNAUTHORIZED');
    }
    res.json({ user: toPublicUser(user) });
  }),
);

/** Log out: destroy the real server-side session. */
authRouter.post(
  '/logout',
  asyncHandler(async (req: Request, res: Response) => {
    const token = req.cookies?.mv_session;
    if (token) store.deleteSession(token);
    res.clearCookie('mv_session', { path: '/' });
    res.json({ ok: true });
  }),
);

/** Update profile (full name). */
authRouter.patch(
  '/profile',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { fullName } = req.body ?? {};
    if (typeof fullName !== 'string' || !isValidFullName(fullName)) {
      throw new ApiError(400, 'Enter a valid full name.', 'VALIDATION', {
        fullName: 'Enter your full name (2-100 characters).',
      });
    }
    const user = store.updateUser(req.user!.id, { fullName: fullName.trim() });
    res.json({ user: toPublicUser(user!) });
  }),
);
