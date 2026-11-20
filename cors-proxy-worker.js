/**
 * Cloudflare Worker اختياري: يمرّر طلبات مصادر HLS التي تمنع المتصفح (CORS / Referer).
 * 1) cloudflare.com ← Workers & Pages ← Create ← Worker ← الصق هذا الكود ← Deploy.
 * 2) غيّر ALLOWED_ORIGIN إلى رابط موقعك (مثل https://younes7o.github.io).
 * 3) ضع رابط الـ Worker في CONFIG.PROXY_URL داخل index.html.
 * تنبيه: لا تفتحه للجميع؛ الشرط بالأسفل يقصره على موقعك فقط. راجع شروط Cloudflare بخصوص بث الفيديو.
 */
const ALLOWED_ORIGIN = 'https://YOUR-NAME.github.io';

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    const cors = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Expose-Headers': 'Content-Length,Content-Range' };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (origin !== ALLOWED_ORIGIN) return new Response('forbidden', { status: 403 });
    const u = new URL(req.url);
    const target = u.searchParams.get('u');
    if (!target || !/^https?:\/\//i.test(target)) return new Response('bad request', { status: 400 });
    const h = new Headers();
    const range = req.headers.get('Range'); if (range) h.set('Range', range);
    const ref = u.searchParams.get('r'); if (ref) h.set('Referer', ref);
    h.set('User-Agent', 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36');
    const r = await fetch(target, { headers: h, redirect: 'follow' });
    const o = new Headers(r.headers);
    Object.entries(cors).forEach(([k, v]) => o.set(k, v));
    return new Response(r.body, { status: r.status, headers: o });
  }
};
