import { createReadStream, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import multer from 'multer';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { config } from '../config.js';
import { newUuid } from '../crypto.js';
import { ApiError, asyncHandler, requireAuth, type AuthRequest } from '../middleware.js';
import { store } from '../store.js';
import type { RecordMeta } from '../types.js';
import {
  isAllowedFileName,
  isAllowedMime,
  isRecordCategory,
  isValidIsoDate,
} from '../validation.js';

export const recordsRouter = Router();

function sanitizedFileName(fileName: string): string {
  const ext = extname(fileName).toLowerCase();
  const base = fileName
    .slice(0, fileName.length - ext.length)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'file';
  return `${newUuid()}-${base}${ext}`;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const userDir = join(config.uploadsDir, (req as AuthRequest).user!.id);
      mkdirSync(userDir, { recursive: true });
      cb(null, userDir);
    },
    filename: (_req, file, cb) => {
      cb(null, sanitizedFileName(file.originalname));
    },
  }),
  limits: {
    fileSize: config.maxUploadBytes,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedMime(file.mimetype) || !isAllowedFileName(file.originalname)) {
      cb(
        new ApiError(
          400,
          'Only PDF, PNG, JPG and JPEG files are supported.',
          'INVALID_FILE_TYPE',
        ),
      );
      return;
    }
    cb(null, true);
  },
});

/** Upload a medical record file and save its metadata. */
recordsRouter.post(
  '/',
  requireAuth,
  (req: Request, res: Response, next) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof ApiError) return next(err);
        if (err && typeof err === 'object' && 'code' in err) {
          const code = (err as { code?: string }).code;
          if (code === 'LIMIT_FILE_SIZE') {
            return next(
              new ApiError(
                400,
                `File is too large. Maximum size is ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB.`,
                'FILE_TOO_LARGE',
              ),
            );
          }
        }
        return next(err);
      }
      next();
    });
  },
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const file = req.file;
    if (!file) {
      throw new ApiError(400, 'Please choose a file to upload.', 'NO_FILE', {
        file: 'Please choose a file to upload.',
      });
    }
    const { title, category, recordDate } = req.body;

    const fields: Record<string, string> = {};
    if (typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 120) {
      fields.title = 'Give the record a title (2-120 characters).';
    }
    if (typeof category !== 'string' || !isRecordCategory(category)) {
      fields.category = 'Choose a valid category.';
    }
    if (typeof recordDate !== 'string' || !isValidIsoDate(recordDate)) {
      fields.recordDate = 'Choose a valid record date.';
    }
    if (Object.keys(fields).length > 0) {
      // Remove the stored file if metadata is invalid.
      const path = join(config.uploadsDir, file.path);
      if (existsSync(path)) unlinkSync(path);
      throw new ApiError(400, 'Please fix the highlighted fields.', 'VALIDATION', fields);
    }

    const record = store.addRecord({
      id: newUuid(),
      userId: req.user!.id,
      title: (title as string).trim(),
      category: category as string,
      recordDate: recordDate as string,
      fileName: file.originalname,
      fileType: file.mimetype,
      fileSize: file.size,
      storagePath: relative(config.uploadsDir, file.path),
      uploadedAt: new Date().toISOString(),
    });

    res.status(201).json({ record });
  }),
);

/** List the signed-in user's records (search + category filter). */
recordsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    let records = store.recordsForUser(req.user!.id);
    if (category && isRecordCategory(category)) {
      records = records.filter((r) => r.category === category);
    }
    if (search) {
      records = records.filter(
        (r) =>
          r.title.toLowerCase().includes(search) ||
          r.fileName.toLowerCase().includes(search) ||
          r.category.toLowerCase().includes(search),
      );
    }
    res.json({ records });
  }),
);

function getOwnedRecord(req: AuthRequest): RecordMeta {
  const record = store.recordById(req.params.id as string);
  if (!record || record.userId !== req.user!.id) {
    throw new ApiError(404, 'Record not found.', 'NOT_FOUND');
  }
  return record;
}

/** Record metadata. */
recordsRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json({ record: getOwnedRecord(req) });
  }),
);

/** Stream the file for preview/open (inline). */
recordsRouter.get(
  '/:id/file',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const record = getOwnedRecord(req);
    const path = join(config.uploadsDir, record.storagePath);
    if (!existsSync(path)) {
      throw new ApiError(404, 'The file for this record is no longer available.', 'FILE_MISSING');
    }
    res.setHeader('Content-Type', record.fileType);
    res.setHeader('Content-Disposition', `inline; filename="${record.fileName}"`);
    createReadStream(path).pipe(res);
  }),
);

/** Download the file (attachment). */
recordsRouter.get(
  '/:id/download',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const record = getOwnedRecord(req);
    const path = join(config.uploadsDir, record.storagePath);
    if (!existsSync(path)) {
      throw new ApiError(404, 'The file for this record is no longer available.', 'FILE_MISSING');
    }
    res.setHeader('Content-Type', record.fileType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${record.fileName.replace(/"/g, "'")}"`,
    );
    createReadStream(path).pipe(res);
  }),
);

/** Delete a record and its stored file. */
recordsRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const record = getOwnedRecord(req);
    const path = join(config.uploadsDir, record.storagePath);
    // Remove shares that reference this record so stale links cannot
    // point at deleted files.
    for (const share of store.shares()) {
      if (share.recordIds.includes(record.id)) {
        const remaining = share.recordIds.filter((id) => id !== record.id);
        if (remaining.length === 0) {
          store.deleteShare(share.id);
          store.deleteGuestSessionsForShare(share.id);
        } else {
          store.updateShare(share.id, { recordIds: remaining });
        }
      }
    }
    store.deleteRecord(record.id);
    if (existsSync(path)) unlinkSync(path);
    res.json({ ok: true });
  }),
);
