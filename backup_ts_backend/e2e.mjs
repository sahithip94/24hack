// Manual E2E smoke test against a running backend on :8787
const BASE = 'http://localhost:8787';
let cookie = '';

async function req(method, path, body, headers = {}) {
  const h = { ...headers };
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    h['content-type'] = 'application/json';
  }
  if (cookie) h.cookie = cookie;
  const res = await fetch(BASE + path, {
    method,
    headers: h,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const setCookies = res.headers.getSetCookie();
  if (setCookies.length) cookie = setCookies[0].split(';')[0];
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const email = 'e2e-' + Date.now() + '@example.com';
console.log('1. signup', await req('POST', '/api/auth/signup', { fullName: 'E2E Tester', email, password: 'securepass1' }).then(r => r.status));
const verify = await req('POST', '/api/auth/login', { email, password: 'securepass1' });
console.log('2. login before verify (expect 403):', verify.status, verify.json?.code);

// fetch the token from the data file
const { readFileSync } = await import('node:fs');
const data = JSON.parse(readFileSync('data/medivault.json', 'utf-8'));
const user = data.users.find(u => u.email === email);
console.log('3. verify email:', (await req('GET', '/api/auth/verify-email?token=' + user.emailVerificationToken)).status);

const login = await req('POST', '/api/auth/login', { email, password: 'securepass1' });
console.log('4. login after verify (expect 200):', login.status);

const me = await req('GET', '/api/auth/me');
console.log('5. me (expect fullName E2E Tester):', me.status, me.json?.user?.fullName);

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA83e6vgAAAABJRU5ErkJggg==', 'base64');
const form = new FormData();
form.append('file', new Blob([png], { type: 'image/png' }), 'report.png');
form.append('title', 'E2E Report');
form.append('category', 'Lab Result');
form.append('recordDate', '2026-03-01');
const up = await req('POST', '/api/records', form);
console.log('6. upload (expect 201):', up.status, up.json?.record?.id);

const list = await req('GET', '/api/records');
console.log('7. list (expect 1):', list.status, list.json?.records?.length);

const share = await req('POST', '/api/shares', { recordIds: [up.json.record.id], recipientLabel: 'E2E Recipient', expiresIn: 3600 });
console.log('8. create share (expect 201, pin):', share.status, share.json?.pin);

const meta = await req('GET', '/api/share/' + share.json.token + '/meta');
console.log('9. guest meta (expect 200):', meta.status, meta.json?.tokenValid);

const wrong = await req('POST', '/api/share/' + share.json.token + '/verify', { pin: '000000' });
console.log('10. wrong pin (expect 401):', wrong.status);

const good = await req('POST', '/api/share/' + share.json.token + '/verify', { pin: share.json.pin });
console.log('11. right pin (expect 200):', good.status);

const grec = await req('GET', '/api/share/' + share.json.token + '/records');
console.log('12. guest records (expect E2E Report):', grec.status, grec.json?.records?.[0]?.title);

const revoke = await req('POST', '/api/shares/' + share.json.id + '/revoke');
console.log('13. revoke (expect 200):', revoke.status);

const after = await req('GET', '/api/share/' + share.json.token + '/meta');
console.log('14. meta after revoke (expect 410):', after.status, after.json?.code);

const logout = await req('POST', '/api/auth/logout');
console.log('15. logout (expect 200):', logout.status);
const meAfter = await req('GET', '/api/auth/me');
console.log('16. me after logout (expect 401):', meAfter.status);
