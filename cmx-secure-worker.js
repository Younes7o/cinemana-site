/* Cinemana Max — وسيط الفيديو الآمن (Cloudflare Worker)
   الرابط الحقيقي لا يصل للمتصفح أبداً: الموقع يرسل الرمز المشفّر فقط، والـ Worker يفكّه ويجلب الفيديو ويمرّره.
   أي طلب من خارج الموقع (سحب/curl/فتح مباشر) يُحوَّل لرابط الطُعم.
   المتغيرات (Settings → Variables):  KEY = عبارة التشفير نفسها (Secret) ،  ALLOW = نطاق موقعك مثل younes7o.github.io (يمكن عدة نطاقات بفاصلة) ،  DECOY = رابط الطُعم (اختياري) */
const DEF_DECOY = 'https://stream.mux.com/hnZSWV4oluS00d9lnwK5OPX02X3QsCphoZTFHIw015JmY8.m3u8';
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const b64u = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
let keyP;
const getKey = env => keyP || (keyP = crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.KEY)).then(h => crypto.subtle.importKey('raw', h, 'AES-GCM', false, ['encrypt', 'decrypt'])));
async function dec(env, tok) { const raw = unb64u(tok); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await getKey(env), raw.slice(12))); }
async function enc(env, url) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await getKey(env), new TextEncoder().encode(url))); const o = new Uint8Array(12 + ct.length); o.set(iv); o.set(ct, 12); return b64u(o); }
const hostOf = v => { try { return new URL(v).hostname.toLowerCase(); } catch (e) { return ''; } };
function allowed(req, env) {
  const list = (env.ALLOW || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const h = hostOf(req.headers.get('Origin') || '') || hostOf(req.headers.get('Referer') || '');
  if (!h || !list.length) return false;
  if (req.headers.get('Sec-Fetch-Dest') === 'document') return false;   // فتح الرابط مباشرة في تبويب
  return list.some(a => h === a || h.endsWith('.' + a));
}
const isM3u8Url = u => { try { return /\.m3u8$/i.test(new URL(u).pathname); } catch (e) { return false; } };
export default {
  async fetch(req, env) {
    const url = new URL(req.url), decoy = env.DECOY || DEF_DECOY, origin = req.headers.get('Origin') || '';
    const cors = { 'Access-Control-Allow-Origin': origin || '*', 'Access-Control-Allow-Headers': 'Range,Content-Type', 'Access-Control-Expose-Headers': 'Content-Range,Content-Length,Accept-Ranges', 'Vary': 'Origin', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const bad = () => Response.redirect(decoy, 302);
    if (!env.KEY || !allowed(req, env)) return bad();
    const m = url.pathname.match(/^\/(k|s)\/([A-Za-z0-9_-]+)(?:\.[a-z0-9]+)?$/i); if (!m) return bad();
    let real; try { real = await dec(env, m[2]); } catch (e) { return bad(); }
    if (!/^https?:\/\//i.test(real)) return bad();
    if (m[1] === 'k') return new Response(JSON.stringify({ k: isM3u8Url(real) || /m3u8/i.test(real) ? 'hls' : 'file' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    const h = { 'User-Agent': UA, 'Accept': '*/*' }; const rg = req.headers.get('Range'); if (rg) h.Range = rg;
    let up; try { up = await fetch(real, { headers: h, redirect: 'follow' }); } catch (e) { return new Response('upstream', { status: 502, headers: cors }); }
    const ct = up.headers.get('Content-Type') || '';
    if (isM3u8Url(up.url) || /mpegurl/i.test(ct)) {
      const base = up.url, self = url.origin;
      const wrap = async u => { let abs; try { abs = new URL(u, base).href; } catch (e) { return u; } return self + '/s/' + await enc(env, abs) + (isM3u8Url(abs) ? '.m3u8' : ''); };
      const lines = (await up.text()).split(/\r?\n/), out = [];
      for (const ln of lines) {
        if (!ln.trim()) { out.push(ln); continue; }
        if (ln.startsWith('#')) { let r = ln; const ms = [...ln.matchAll(/URI="([^"]+)"/g)]; for (const x of ms) r = r.replace(x[0], 'URI="' + await wrap(x[1]) + '"'); out.push(r); }
        else out.push(await wrap(ln.trim()));
      }
      return new Response(out.join('\n'), { status: 200, headers: { ...cors, 'Content-Type': 'application/vnd.apple.mpegurl' } });
    }
    const rh = { ...cors, 'Accept-Ranges': up.headers.get('Accept-Ranges') || 'bytes' };
    for (const k of ['Content-Type', 'Content-Length', 'Content-Range']) { const v = up.headers.get(k); if (v) rh[k] = v; }
    return new Response(up.body, { status: up.status, headers: rh });
  }
};
