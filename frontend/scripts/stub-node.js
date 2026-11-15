// Minimal browser context for running httpApi.ts under Node.
const jar = new Map();
globalThis.document = {
  get cookie() {
    return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  },
};
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const headers = new Headers(init.headers);
  if (jar.size) headers.set('Cookie', document.cookie);
  const res = await realFetch(String(url).startsWith('http') ? url : 'http://127.0.0.1:5000' + url,
    { ...init, headers, redirect: 'manual' });
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const [pair] = sc.split(';');
    const i = pair.indexOf('=');
    const k = pair.slice(0, i).trim();
    const v = pair.slice(i + 1).trim();
    if (!v || /Expires=Thu, 01 Jan 1970/i.test(sc)) jar.delete(k); else jar.set(k, v);
  }
  return res;
};
