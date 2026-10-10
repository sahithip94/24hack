import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { Store } from '../src/store.js';

process.env.NODE_ENV = 'test';
process.env.PORT = '8799';
const dataDir = mkdtempSync(join(tmpdir(), 'medivault-test-'));
process.env.DATA_FILE = join(dataDir, 'test.json');
process.env.UPLOADS_DIR = join(dataDir, 'uploads');
process.env.FRONTEND_URL = 'http://localhost:5173';

const BASE = 'http://localhost:8799';

let app: import('express').Express;
let store: Store;
let server: import('node:http').Server;

// Minimal 1x1 PNG.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA83e6vgAAAABJRU5ErkJggg==',
  'base64',
);

interface TestContext {
  cookies: string[];
}

async function request(
  method: string,
  path: string,
  ctx: TestContext = { cookies: [] },
  body?: FormData | unknown,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (ctx.cookies.length > 0) headers.cookie = ctx.cookies.join('; ');
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['content-type'] = 'application/json';
  }
  return fetch(BASE + path, { method, headers, body: payload, redirect: 'manual' });
}

function captureCookies(res: Response, ctx: TestContext): void {
  const setCookies = res.headers.getSetCookie();
  for (const c of setCookies) {
    const [pair] = c.split(';');
    const [name, ...rest] = pair.split('=');
    ctx.cookies = ctx.cookies.filter((existing) => !existing.startsWith(`${name}=`));
    ctx.cookies.push(`${name}=${rest.join('=')}`);
  }
}

before(async () => {
  const mod = await import('../src/index.js');
  app = mod.app;
  store = (await import('../src/store.js')).store;
  server = app.listen(8799);
});

after(() => {
  server?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

const user = {
  fullName: 'Ada Testpatient',
  email: 'ada@example.com',
  password: 'securepass1',
};

describe('MediVault API smoke tests', () => {
  it('signs up a new user who is usable immediately (no email verification)', async () => {
    const res = await request('POST', '/api/auth/signup', undefined, user);
    assert.equal(res.status, 201);
    const body = (await res.json()) as {
      user?: { email: string };
      message?: string;
      devVerificationUrl?: string;
    };
    assert.equal(body.user?.email, user.email);
    assert.equal(body.devVerificationUrl, undefined);
  });

  it('logs in immediately without any verification step and exposes /api/auth/me', async () => {
    const ctx: TestContext = { cookies: [] };
    const res = await request('POST', '/api/auth/login', ctx, {
      email: user.email,
      password: user.password,
    });
    assert.equal(res.status, 200);
    captureCookies(res, ctx);
    const me = await request('GET', '/api/auth/me', ctx);
    assert.equal(me.status, 200);
    const body = (await me.json()) as { user: { fullName: string; email: string } };
    assert.equal(body.user.fullName, user.fullName);
    assert.equal(body.user.email, user.email);
    (globalThis as Record<string, unknown>).ctxUser = ctx;
  });

  it('no longer exposes the email-verification endpoints', async () => {
    const verify = await request('GET', '/api/auth/verify-email?token=anything');
    assert.equal(verify.status, 404);
    const resend = await request('POST', '/api/auth/resend-verification', undefined, {
      email: user.email,
    });
    assert.equal(resend.status, 404);
  });

  it('rejects protected routes without a session', async () => {
    const res = await request('GET', '/api/records');
    assert.equal(res.status, 401);
  });

  it('rejects wrong passwords', async () => {
    const res = await request('POST', '/api/auth/login', undefined, {
      email: user.email,
      password: 'wrongpass1',
    });
    assert.equal(res.status, 401);
  });

  it('uploads a real PNG and stores its metadata', async () => {
    const ctx = (globalThis as Record<string, unknown>).ctxUser as TestContext;
    const form = new FormData();
    form.append('file', new Blob([PNG_1x1], { type: 'image/png' }), 'xray.png');
    form.append('title', 'Chest X-Ray');
    form.append('category', 'Imaging');
    form.append('recordDate', '2026-01-15');
    const res = await request('POST', '/api/records', ctx, form);
    assert.equal(res.status, 201);
    const body = (await res.json()) as { record: { id: string } };
    assert.ok(body.record.id);
    (globalThis as Record<string, unknown>).testRecordId = body.record.id;
  });

  it('rejects disallowed file types', async () => {
    const ctx = (globalThis as Record<string, unknown>).ctxUser as TestContext;
    const form = new FormData();
    form.append('file', new Blob([Buffer.from('not a file')], { type: 'text/plain' }), 'notes.txt');
    form.append('title', 'Notes');
    form.append('category', 'Other');
    form.append('recordDate', '2026-01-01');
    const res = await request('POST', '/api/records', ctx, form);
    assert.equal(res.status, 400);
  });

  it('lists records for the owner', async () => {
    const ctx = (globalThis as Record<string, unknown>).ctxUser as TestContext;
    const res = await request('GET', '/api/records?search=chest', ctx);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { records: unknown[] };
    assert.equal(body.records.length, 1);
  });

  it('streams the uploaded file for preview', async () => {
    const ctx = (globalThis as Record<string, unknown>).ctxUser as TestContext;
    const recordId = (globalThis as Record<string, unknown>).testRecordId as string;
    const res = await request('GET', `/api/records/${recordId}/file`, ctx);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
  });

  it('creates a guest share with a PIN and link', async () => {
    const ctx = (globalThis as Record<string, unknown>).ctxUser as TestContext;
    const recordId = (globalThis as Record<string, unknown>).testRecordId as string;
    const res = await request('POST', '/api/shares', ctx, {
      recordIds: [recordId],
      recipientLabel: 'Mom',
      expiresIn: 3600,
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as {
      token: string;
      pin: string;
      url: string;
      id: string;
    };
    assert.match(body.url, /\/share\//);
    assert.match(body.pin, /^\d{6}$/);
    (globalThis as Record<string, unknown>).testShare = body;
  });

  it('exposes share meta without revealing record names', async () => {
    const share = (globalThis as Record<string, unknown>).testShare as { token: string };
    const res = await request('GET', `/api/share/${share.token}/meta`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { tokenValid: boolean; requiresPin: boolean };
    assert.equal(body.tokenValid, true);
    assert.equal(body.requiresPin, true);
    const text = JSON.stringify(body);
    assert.ok(!text.includes('Chest X-Ray'));
  });

  it('rejects a wrong PIN and enforces the rate limit eventually', async () => {
    const share = (globalThis as Record<string, unknown>).testShare as { token: string };
    const res = await request('POST', `/api/share/${share.token}/verify`, undefined, { pin: '000000' });
    assert.equal(res.status, 401);
    const body = (await res.json()) as { code: string; fields?: { attemptsRemaining?: string } };
    assert.equal(body.code, 'INVALID_PIN');
  });

  it('verifies the correct PIN and lists shared records for the guest', async () => {
    const share = (globalThis as Record<string, unknown>).testShare as { token: string; pin: string };
    const ctx: TestContext = { cookies: [] };
    const res = await request('POST', `/api/share/${share.token}/verify`, ctx, { pin: share.pin });
    assert.equal(res.status, 200);
    captureCookies(res, ctx);

    const recordsRes = await request('GET', `/api/share/${share.token}/records`, ctx);
    assert.equal(recordsRes.status, 200);
    const body = (await recordsRes.json()) as {
      share: { recipientLabel: string | null };
      records: Array<{ title: string }>;
    };
    assert.equal(body.share.recipientLabel, 'Mom');
    assert.equal(body.records.length, 1);
    assert.equal(body.records[0].title, 'Chest X-Ray');
    (globalThis as Record<string, unknown>).guestCtx = ctx;
  });

  it('lets the guest open the shared file', async () => {
    const share = (globalThis as Record<string, unknown>).testShare as { token: string };
    const recordId = (globalThis as Record<string, unknown>).testRecordId as string;
    const ctx = (globalThis as Record<string, unknown>).guestCtx as TestContext;
    const res = await request('GET', `/api/share/${share.token}/records/${recordId}/file`, ctx);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
  });

  it('prevents a guest from reaching records outside the share', async () => {
    const share = (globalThis as Record<string, unknown>).testShare as { token: string };
    const ctx = (globalThis as Record<string, unknown>).guestCtx as TestContext;
    const res = await request(
      'GET',
      `/api/share/${share.token}/records/nonexistent-record/file`,
      ctx,
    );
    assert.equal(res.status, 404);
  });

  it('blocks guest data access before PIN verification', async () => {
    const share = (globalThis as Record<string, unknown>).testShare as { token: string };
    const res = await request('GET', `/api/share/${share.token}/records`);
    assert.equal(res.status, 401);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, 'GUEST_VERIFICATION_REQUIRED');
  });

  it('revocation immediately stops access', async () => {
    const share = (globalThis as Record<string, unknown>).testShare as { id: string; token: string };
    const ctx = (globalThis as Record<string, unknown>).ctxUser as TestContext;
    const revoke = await request('POST', `/api/shares/${share.id}/revoke`, ctx);
    assert.equal(revoke.status, 200);

    const meta = await request('GET', `/api/share/${share.token}/meta`);
    assert.equal(meta.status, 410);

    const guestCtx = (globalThis as Record<string, unknown>).guestCtx as TestContext;
    const records = await request('GET', `/api/share/${share.token}/records`, guestCtx);
    assert.equal(records.status, 410);
  });

  it('expired shares stop working even with a valid guest session', async () => {
    const ctx = (globalThis as Record<string, unknown>).ctxUser as TestContext;
    const recordId = (globalThis as Record<string, unknown>).testRecordId as string;
    const create = await request('POST', '/api/shares', ctx, {
      recordIds: [recordId],
      expiresIn: 3600,
    });
    const created = (await create.json()) as { id: string; token: string; pin: string };

    // Simulate expiry by moving the expiry into the past.
    store.updateShare(created.id, {
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    const meta = await request('GET', `/api/share/${created.token}/meta`);
    assert.equal(meta.status, 410);
    const body = (await meta.json()) as { code: string };
    assert.equal(body.code, 'EXPIRED');
  });

  it('deletes a record, its file, and cleans up shares referencing it', async () => {
    const ctx = (globalThis as Record<string, unknown>).ctxUser as TestContext;
    const recordId = (globalThis as Record<string, unknown>).testRecordId as string;
    const res = await request('DELETE', `/api/records/${recordId}`, ctx);
    assert.equal(res.status, 200);
    const after = await request('GET', '/api/records', ctx);
    const body = (await after.json()) as { records: unknown[] };
    assert.equal(body.records.length, 0);
    assert.equal(store.recordById(recordId), undefined);
  });

  it('AI summary runs in clearly-labelled demo mode from metadata only', async () => {
    const ctx = (globalThis as Record<string, unknown>).ctxUser as TestContext;
    const form = new FormData();
    form.append('file', new Blob([PNG_1x1], { type: 'image/png' }), 'lab.png');
    form.append('title', 'Blood Panel');
    form.append('category', 'Lab Result');
    form.append('recordDate', '2026-02-01');
    await request('POST', '/api/records', ctx, form);

    const res = await request('POST', '/api/ai/summary', ctx, {});
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      mode: string;
      disclaimer: string;
      recordCount: number;
    };
    assert.equal(body.mode, 'demo');
    assert.ok(body.disclaimer.toLowerCase().includes('demo'));
    assert.ok(body.recordCount >= 1);
  });

  it('logs out and invalidates the session', async () => {
    const ctx = (globalThis as Record<string, unknown>).ctxUser as TestContext;
    const res = await request('POST', '/api/auth/logout', ctx);
    assert.equal(res.status, 200);
    const me = await request('GET', '/api/auth/me', ctx);
    assert.equal(me.status, 401);
  });
});
