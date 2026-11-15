// thinkingForMe — 내 생각·의견·사업구상을 심플부터 세세하게까지
// 기록 모양: 한 항목 = { id, kind, u(고친 시각), ...내용 }
//   node(생각) · link(연결) · photo(사진) · use(하루 사용 횟수) · review(주간 회고) · settings(설정)
const CFG = window.TFM_CONFIG || {};
const TEST = window.__TFM_TEST__;
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* 저장 불가 */ } },
};
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), b => 'abcdefghijkmnpqrstuvwxyz23456789'[b & 31]).join('');
const ymd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DAY = 864e5;
const DEPTHS = ['', '단어', '한 줄', '요약', '상세', '원문'];
const KINDS = { 생각: 1, 의견: 1, 구상: 1, 자료: 1, 기록: 1 };
const STAGES = ['씨앗', '새싹', '나무'];
const NEEDS = ['돈', '시간', '인정', '재미', '편리', '연결', '성장', '안정', '건강'];
const NOTI = { mantra: '만트라', nudge: '한 줄 적기 알림', review: '주간 회고' };

const S = { flow: ls.get('tfm:flow') || 'date', items: new Map(), user: null, depth: +(ls.get('tfm:depth') || 2), unlocked: false, view: 'home', open: new Set(JSON.parse(ls.get('tfm:open') || '[]')) };
let sb = null, queue = new Set(JSON.parse(ls.get('tfm:q') || '[]'));

// ── 자료 ─────────────────────────────────────────────────────────────
const all = kind => [...S.items.values()].filter(i => i.kind === kind && !i.deleted);
const node = id => { const n = S.items.get(id); return n && !n.deleted && n.kind === 'node' ? n : null; };
const vis = n => n && (S.unlocked || !n.p);
const nodes = () => all('node').filter(vis);
const links = () => all('link').filter(l => vis(node(l.a)) && vis(node(l.b)));
const settings = () => S.items.get('settings') || { id: 'settings', kind: 'settings', notis: [] };
const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

function saveCache() {
  ls.set('tfm:cache', JSON.stringify([...S.items.values()].filter(i => i.kind !== 'photo')));
  ls.set('tfm:q', JSON.stringify([...queue]));
}
function put(it, quiet) {
  it.u = Date.now();
  S.items.set(it.id, it);
  queue.add(it.id);
  saveCache(); flush();
  if (!quiet) render();
  return it;
}
let flushing = false;
async function flush() {
  if (!sb || !S.user || flushing || !queue.size) return;
  flushing = true;
  const ids = [...queue];
  const rows = ids.map(id => S.items.get(id)).filter(Boolean).map(({ id, kind, u, deleted, ...data }) => ({ user_id: S.user.id, id, kind, data, updated_at: u, deleted: !!deleted }));
  try {
    const { error } = await sb.from('think_items').upsert(rows, { onConflict: 'user_id,id' });
    if (error) throw error;
    ids.forEach(id => queue.delete(id)); saveCache();
  } catch (e) { console.warn(e); toast('서버에 저장하지 못했습니다. 연결되면 다시 올립니다.'); }
  flushing = false;
  if (queue.size && navigator.onLine) setTimeout(flush, 4000);
}
const fromRow = r => ({ ...r.data, id: r.id, kind: r.kind, u: r.updated_at, ...(r.deleted ? { deleted: true } : {}) });
async function pull() {
  let rows = [];
  if (TEST) rows = TEST.rows;
  else for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('think_items').select('id,kind,data,updated_at,deleted').neq('kind', 'photo').range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  for (const r of rows) {
    const cur = S.items.get(r.id);
    if (cur && queue.has(r.id) && cur.u >= r.updated_at) continue;   // 아직 못 올린 내 수정이 더 최신
    S.items.set(r.id, fromRow(r));
  }
  saveCache();
}

// ── 비슷한 생각 찾기 ──────────────────────────────────────────────────
const grams = s => { const t = String(s).toLowerCase().replace(/[^0-9a-z가-힣]/g, ''); const g = new Set(); for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2)); return g; };
function sim(a, b) { const A = grams(a), B = grams(b); if (!A.size || !B.size) return 0; let n = 0; for (const x of A) if (B.has(x)) n++; return n / (A.size + B.size - n); }
const nearest = (text, k = 20, skip) => all('node').filter(n => n.id !== skip).map(n => [sim(text, n.t + ' ' + (n.s || '')), n]).sort((a, b) => b[0] - a[0]).slice(0, k);

// ── 하루 사용 횟수 (목표: 하루 5번) ────────────────────────────────────
const useOf = d => S.items.get('use:' + d)?.n || 0;
function bump(add) {
  const id = 'use:' + ymd();
  const it = S.items.get(id) || { id, kind: 'use', n: 0, adds: 0 };
  it.n++; if (add) it.adds = (it.adds || 0) + 1;
  put(it, true);
}
function streak() { let d = new Date(), n = 0; if (!useOf(ymd(d))) d = new Date(d - DAY); while (useOf(ymd(d))) { n++; d = new Date(d - DAY); } return n; }

// ── 생각 적기 ─────────────────────────────────────────────────────────
function addThought(text) {
  text = text.trim(); if (!text) return;
  bump(true);
  const [score, hit] = nearest(text, 1)[0] || [0, null];
  if (hit && sim(text, hit.t) >= 0.7 || score >= 0.8) {
    const before = JSON.stringify(hit);
    hit.n = (hit.n || 1) + 1; hit.last = Date.now();
    (hit.hist ||= []).push({ at: Date.now(), again: text });
    put(hit);
    toast(`비슷한 생각과 합쳤습니다. ${hit.n}번째입니다`, '따로 두기', () => { S.items.set(hit.id, JSON.parse(before)); put(S.items.get(hit.id), true); create(text); });
    return;
  }
  create(text);
}
function create(text) {
  const url = (text.match(/https?:\/\/\S+/) || [])[0] || '', plain = text.replace(url, '').trim() || text;
  const n = put({ id: newId(), kind: 'node', t: plain.slice(0, 140), w: plain.split(/\s+/)[0].slice(0, 8), s: '', raw: text, c: '미분류', g: '새 생각', k: '생각', at: Date.now(), n: 1, st: 0, src: 'me', ...(url ? { url, ...(yt(url) ? { img: yt(url) } : {}) } : {}) });
  
  toast('생각을 적었습니다', settings().gkey ? 'AI로 정리' : '열어 보기', () => settings().gkey ? organize(n.id) : openNode(n.id));
}

// ── AI — 버튼을 누를 때만 부릅니다. Gemini(무료)·Grok·Claude를 일에 따라 나눠 쓰고, 유료 AI는 월 한도 안에서만 ──
const PROV = {
  gemini: { name: 'Gemini', key: 'gkey', model: 'gmodel', def: 'gemini-flash-latest', paid: false, pin: 0, pout: 0 },
  grok: { name: 'Grok', key: 'xkey', model: 'xmodel', def: 'grok-4-fast', paid: true, pin: 0.2, pout: 0.5 },
  claude: { name: 'Claude', key: 'ckey', model: 'cmodel', def: 'claude-sonnet-5-5', paid: true, pin: 3, pout: 15 },
};
// 일마다 먼저 부를 순서: 자주 하는 정리는 무료 Gemini, 깊게 따져야 하는 평가·회고는 Claude, 짧은 질문·만트라는 Grok
const ROUTE = { work: ['grok', 'claude', 'gemini'], organize: ['gemini', 'grok', 'claude'], judge: ['claude', 'grok', 'gemini'], weekly: ['claude', 'gemini', 'grok'], ask: ['grok', 'gemini', 'claude'], mantra: ['grok', 'gemini', 'claude'] };
const NEED = { work: ['syn'], organize: ['t'], judge: ['inv', 'cus', 'com'], weekly: ['text'], ask: ['answer'], mantra: ['list'] };   // 답에 꼭 있어야 하는 칸
const month = () => ymd().slice(0, 7);
const usd = v => '$' + (+v || 0).toFixed(2);
const spendOf = () => settings().spend?.[month()] || {};
const spent = () => (spendOf().claude || 0) + (spendOf().grok || 0);
const cap = () => +(settings().cap ?? 20) || 20;
function charge(p, inT, outT) {
  const P = PROV[p]; if (!P.paid) return;
  const s = settings(), m = ((s.spend ||= {})[month()] ||= {}), before = spent(), c = cap();
  m[p] = (m[p] || 0) + ((inT || 0) * P.pin + (outT || 0) * P.pout) / 1e6;
  put(s, true);
  const now = spent();
  if (before < c * 0.8 && now >= c * 0.8 && now < c) toast(`이번 달 유료 AI ${usd(now)}, 한도 ${usd(c)}의 80%입니다`);
  if (before < c && now >= c) toast(`이번 달 한도 ${usd(c)}에 닿아 Claude·Grok은 멈추고 Gemini만 씁니다`);
}
const parseJ = t => { const s = String(t), a = s.indexOf('{'), b = s.lastIndexOf('}'); return JSON.parse(a >= 0 ? s.slice(a, b + 1) : s); };
async function call(p, prompt, mdl) {
  const P = PROV[p], s = settings(), key = s[P.key], model = mdl || s[P.model] || P.def, ac = new AbortController(), tm = setTimeout(() => ac.abort(), 45000);
  let res;
  try {
    if (p === 'gemini') res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } }), signal: ac.signal });
    else if (p === 'claude') res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: 'user', content: prompt + '\n\n다른 말 없이 JSON 하나만 출력하라.' }] }), signal: ac.signal });
    else res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model, temperature: 0.4, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }), signal: ac.signal });
  } catch (e) { throw new Error(e.name === 'AbortError' ? `${P.name}가 45초 안에 답하지 않았습니다` : `${P.name}에 연결하지 못했습니다`); } finally { clearTimeout(tm); }
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? `${P.name} 키가 맞지 않습니다. 설정에서 확인해 주세요` : res.status === 429 ? `${P.name} 사용 한도를 넘었습니다. 잠시 뒤 다시 눌러 주세요` : res.status === 400 || res.status === 404 ? `${P.name} 모델 이름(${model})을 설정에서 확인해 주세요` : `${P.name}가 답하지 못했습니다 (${res.status})`);
  const j = await res.json();
  if (p === 'gemini') return { text: (j.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join('') };
  if (p === 'claude') return { text: (j.content || []).map(x => x.text || '').join(''), inT: j.usage?.input_tokens, outT: j.usage?.output_tokens };
  return { text: j.choices?.[0]?.message?.content || '', inT: j.usage?.prompt_tokens, outT: j.usage?.completion_tokens };
}
async function gem(prompt, task = 'organize') {
  const s = settings(), over = spent() >= cap();
  // 키가 있는 AI를 모두 줄 세움. Gemini는 모델마다 무료 한도가 따로라 여러 모델을 차례로 써 봄
  const order = (ROUTE[task] || ROUTE.organize).filter(p => s[PROV[p].key] && !(PROV[p].paid && over))
    .flatMap(p => p === 'gemini' ? [...new Set([s.gmodel || PROV.gemini.def, ...GEM_ALT])].map(m => [p, m]) : [[p, null]]);
  if (!order.length) { toast('AI를 쓰려면 설정에 AI 키를 먼저 넣어 주세요', '설정 열기', openSettings); throw new Error('nokey'); }
  const fails = [];
  for (const [p, mdl] of order) {
    try {
      let r;
      try { r = await call(p, prompt, mdl); }
      catch (e) { if (!/한도|45초/.test(e.message)) throw e; await new Promise(z => setTimeout(z, 2500)); r = await call(p, prompt, mdl); }   // 잠깐 막힌 것은 한 번 더
      charge(p, r.inT, r.outT);
      let out; try { out = parseJ(r.text); } catch { throw new Error(`${PROV[p].name}의 답을 읽지 못했습니다`); }
      if ((NEED[task] || []).some(k => !out[k])) throw new Error(`${PROV[p].name}의 답이 비어 있습니다`);
      out._by = PROV[p].name;
      if (fails.length && fails.some(f => !f.startsWith(out._by))) toast(`${[...new Set(fails.map(f => f.split(/[ 의가]/)[0]))].filter(x => x !== out._by).join(', ') || '앞의 AI'} 대신 ${out._by}가 했습니다`);
      return out;
    } catch (e) { fails.push(String(e.message || e)); console.warn(p, mdl, e); }
  }
  const err = new Error([...new Set(fails)].join(' / ')); err.busy = fails.every(f => /한도|45초|연결|답하지/.test(f)); throw err;
}
const gemT = (task, prompt) => gem(prompt, task);
const GEM_ALT = ['gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const RUN = new Set();   // 지금 AI가 하고 있는 일 (같은 일을 두 번 누르지 않게)
async function busy(label, fn, key) {
  key ||= label;
  if (RUN.has(key)) return toast('이미 하고 있습니다. 끝나면 알려 드립니다.');
  RUN.add(key); markBusy();
  const t = toast(label + '. 다른 화면을 봐도 됩니다.', null, null, 600000);
  try {
    for (let n = 0; ; n++) {
      try { return await fn(); }
      catch (e) {
        if (e.message === 'nokey') return;
        if (!e.busy || n >= 3) { toast('지금 쓸 수 있는 AI가 답하지 못했습니다. ' + e.message, null, null, 10000); console.warn(e); return; }
        t.textContent = `AI들이 잠시 붐벼서 1분 뒤 알아서 다시 합니다 (${n + 1}/3). 끝나면 알려 드립니다.`;
        await new Promise(z => setTimeout(z, 60000));
        t.textContent = label + '. 다른 화면을 봐도 됩니다.';
      }
    }
  } finally { t.remove(); RUN.delete(key); markBusy(); }
}
// 단추 글자를 '하는 중'으로 바꿔 둠 (창을 다시 그려도 유지)
function markBusy() {
  document.querySelectorAll('[data-act]').forEach(b => {
    const k = { wAI: 'work:' + S.selW, organize: 'org:' + S.sel, persp: 'judge:' + S.sel, weekly: 'weekly', mantraAi: 'mantra', askQ: 'ask' }[b.dataset.act];
    if (!k) return;
    if (!b.dataset.label) b.dataset.label = b.textContent;
    const on = RUN.has(k); b.classList.toggle('loading', on); b.textContent = on ? '하는 중…' : b.dataset.label;
  });
}
// 끝났음을 알림: 화면 위 알림 + 앱이 뒤에 있으면 폰 알림
function done(msg, open) {
  toast(msg, open ? '보기' : null, open, 8000);
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted')
    navigator.serviceWorker?.ready.then(r => r.showNotification('thinkingForMe', { body: msg, tag: 'tfm-ai', icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { url: './' } })).catch(() => {});
}
// 결과가 나온 생각의 창이 열려 있으면 다시 그리고, 아니면 알림의 '보기'로 열게 함
const refresh = id => { if (SH.length && SH[SH.length - 1].key === 'node:' + id) SH[SH.length - 1](); else render(); };
const groupsText = () => [...new Set(all('node').map(n => `${n.c} > ${n.g}`))].join('\n');

async function organize(id) {
  const n = node(id); if (!n) return;
  const cand = nearest(n.raw || n.t, 25, id).map(([, m]) => `${m.id}|${m.t}`).join('\n');
  const r = await busy('AI가 정리하는 중입니다', () => gemT('organize', `너는 한 사람의 생각 노트를 정리하는 조수다. 아래 "새 생각"을 정리해 JSON 하나로만 답하라. 한국어. 사용자가 하지 않은 말을 지어내지 말 것.
형식: {"w":"핵심 단어 1개(6자 이내)","t":"한 줄(40자 이내)","s":"요약 1~2문장","d":"상세 3~5문장(생각의 배경·의미·열린 질문)","c":"대분류","g":"연결 주제","k":"생각|의견|구상|자료|기록 중 하나","needs":["${NEEDS.join('","')}" 중 이 생각이 건드리는 사람들의 욕구 0~3개],"next":"다음 한 걸음(구상일 때만, 20자 이내, 없으면 빈 문자열)","kw":"이 생각을 나타낼 사진 검색어(영어 1~2단어, 구체적인 사물이나 장면)","links":[{"id":"관련 생각 id","r":"rel 또는 contra(서로 부딪히면)","why":"한 줄 이유"}]}
c와 g는 가능하면 아래 "기존 분류"에서 고르고, 정말 맞는 게 없을 때만 새로 만든다. links는 "후보"의 id만 쓰고 최대 4개.

[새 생각]
${n.raw || n.t}

[기존 분류]
${groupsText()}

[후보]
${cand}`), 'org:' + id);
  if (!r) return;
  (n.hist ||= []).push({ at: Date.now(), t: n.t, s: n.s });
  Object.assign(n, {
    w: String(r.w || n.w).slice(0, 12), t: String(r.t || n.t).slice(0, 140), s: String(r.s || ''), d: String(r.d || ''),
    c: String(r.c || n.c), g: String(r.g || n.g), k: KINDS[r.k] ? r.k : n.k, needs: (r.needs || []).filter(x => NEEDS.includes(x)), next: String(r.next || ''), kw: String(r.kw || n.kw || ''), ai: Date.now(),
  });
  for (const l of r.links || []) if (node(l.id) && l.id !== id) addLink(id, l.id, l.r === 'contra' ? 'contra' : 'rel', l.why, 'ai');
  if (!pic(n) && n.kw) try { const im = (await commons(n.kw, 3))[0]; if (im) { n.img = im.th; n.imgSrc = im.page; } } catch { /* 그림은 없어도 됨 */ }
  put(n); refresh(id);
  done(`${r._by}가 '${n.t.length > 18 ? n.t.slice(0, 17).trim() + '…' : n.t}'을 정리했습니다`, () => openNode(id));
}
async function perspectives(id) {
  const n = node(id); if (!n) return;
  const r = await busy('세 사람의 눈으로 보는 중입니다', () => gemT('judge', `아래 구상을 세 관점에서 냉정하게 평가해 JSON으로만 답하라. 한국어, 각 항목 1~2문장.
형식: {"inv":"투자자가 볼 것(시장·수익·위험)","cus":"고객이 느낄 것(쓸 이유·안 쓸 이유)","com":"경쟁자가 볼 것(이미 있는 것·빈틈)","need":"이 생각이 건드리는 사람들의 욕구와 그 강도, 누가 얼마나 절실한지(추정임을 밝힐 것)","needs":["${NEEDS.join('","')}" 중 0~3개]}

[구상] ${n.t}
${n.s || ''} ${n.d || ''}`), 'judge:' + id);
  if (!r) return;
  n.v = { inv: r.inv, cus: r.cus, com: r.com, need: r.need, by: r._by, at: Date.now() };
  if (r.needs?.length) n.needs = r.needs.filter(x => NEEDS.includes(x));
  put(n); refresh(id);
  done(`${r._by}가 '${n.t.length > 18 ? n.t.slice(0, 17).trim() + '…' : n.t}' 평가를 마쳤습니다`, () => openNode(id));
}
const corpus = () => nodes().map(n => `${n.id}|${n.t}|${(n.s || '').slice(0, 90)}`).join('\n');

// ── 연결 ─────────────────────────────────────────────────────────────
function addLink(a, b, r = 'rel', why = '', by = 'me') {
  const ex = all('link').find(l => (l.a === a && l.b === b) || (l.a === b && l.b === a));
  if (ex) { if (by === 'me') { ex.r = r; put(ex, true); } return ex; }
  return put({ id: 'l_' + newId(), kind: 'link', a, b, r, why, by }, true);
}
const linksOf = id => links().filter(l => l.a === id || l.b === id).map(l => ({ l, o: node(l.a === id ? l.b : l.a) }));

// ── 화면 조각 ─────────────────────────────────────────────────────────
const COL = ['#3182F6', '#F04452', '#00A97F', '#F59E0B', '#7C5CFA', '#E5508C', '#0CA5C1', '#6B7684'];
const colOf = c => COL[hue(c) % COL.length];
const pal = c => [`color-mix(in srgb,${colOf(c)} 15%,var(--card))`, colOf(c)];
const fmtDay = t => { const d = new Date(t); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
const ago = t => { const d = Math.floor((Date.now() - t) / DAY); return d <= 0 ? '오늘' : d === 1 ? '어제' : d < 30 ? `${d}일 전` : d < 365 ? `${Math.floor(d / 30)}달 전` : `${Math.floor(d / 365)}년 전`; };
const pic = n => n.th || n.img || '';
const thumb = (n, cls = 'th') => pic(n)
  ? `<img class="${cls}" src="${esc(pic(n))}" alt="" loading="lazy" referrerpolicy="no-referrer">`
  : `<span class="${cls} tile" style="background:${pal(n.c)[0]};color:${pal(n.c)[1]}">${esc((n.w || n.t).slice(0, 5))}</span>`;
const EV = [['inv', '투자자의 눈'], ['cus', '고객의 눈'], ['com', '경쟁자의 눈'], ['need', '사람들의 욕구']];
const views = v => `<div class="eval">${EV.filter(([k]) => v[k]).map(([k, l]) => `<div><b>${l}</b><p>${esc(v[k])}</p></div>`).join('')}</div>`;
function body(n, d = S.depth, noV) {
  if (d <= 1) return `<b class="w">${esc(n.w || n.t.split(' ')[0])}</b>`;
  let o = `<b>${esc(n.t)}</b>`;
  if (d >= 3 && n.s) o += `<p>${esc(n.s)}</p>`;
  if (d >= 4) {
    if (n.d) o += `<p>${esc(n.d)}</p>`;
    if ((n.needs || []).length || n.next) o += `<div class="chips">${(n.needs || []).map(x => `<span class="chip need">${esc(x)}</span>`).join('')}${n.next ? `<span class="chip">다음 걸음: ${esc(n.next)}</span>` : ''}</div>`;
    if (n.v && !noV) o += `<div style="margin-top:10px">${views(n.v)}</div>`;
  }
  if (d >= 5) {
    if (n.raw && n.raw !== n.s) o += `<p class="raw">“${esc(n.raw)}”</p>`;
    for (const x of n.hist || []) o += `<p class="raw">${fmtDay(x.at)}, ${x.again ? '다시 떠올림: ' + esc(x.again) : '고치기 전: ' + esc(x.t || '') + (x.s ? ' / ' + esc(x.s) : '')}</p>`;
  }
  return o;
}
const card = (n, d = S.depth) => `<button class="item" data-node="${n.id}">${thumb(n)}<span class="rb">${body(n, d)}<span class="meta"><span>${esc(n.g)}</span><span>${ago(n.at)}</span>${n.p ? '<span>잠금</span>' : ''}${(n.n || 1) > 1 ? `<mark>${n.n}번 떠올림</mark>` : ''}${n.v ? '<mark>평가 있음</mark>' : ''}</span></span></button>`;
const byNew = (a, b) => (b.at || 0) - (a.at || 0);
const moved = (n, since) => n.at > since || (n.last || 0) > since;

// 오늘 다시 꺼내 볼 생각: 2주 넘게 지난 내 생각 중에서 날마다 하나 (다른 생각을 누르면 바뀜)
function oldOne() {
  const ns = nodes(), mine = ns.filter(n => n.k !== '자료'), base = mine.length ? mine : ns;
  const old = base.filter(n => Date.now() - n.at > 14 * DAY), pool = (old.length ? old : base).sort((a, b) => a.id < b.id ? -1 : 1);
  if (!pool.length) return null;
  const seed = [...ymd()].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 1e9, 7) + (S.rs || 0) * 7919;
  return pool[seed % pool.length];
}
function viewHome() {
  const ns = nodes(), s = settings(), used = useOf(ymd()), wk = Date.now() - 7 * DAY, st = streak(), now = new Date();
  const src = s.mantraFrom && node(s.mantraFrom), o = oldOne();
  const ideas = ns.filter(n => n.k === '구상').sort((a, b) => (b.st || 0) - (a.st || 0) || byNew(a, b)).slice(0, 5);
  const rep = ns.filter(n => (n.n || 1) > 1).sort((a, b) => b.n - a.n).slice(0, 4);
  const contra = links().filter(l => l.r === 'contra');
  return `<section class="hello"><p class="date">${now.getMonth() + 1}월 ${now.getDate()}일 ${'일월화수목금토'[now.getDay()]}요일</p>
<h1 class="mantra"><span>${esc(s.mantra || '오늘 되뇔 한 문장을 골라 보세요')}</span></h1>
<p class="by">${src ? `${fmtDay(src.at)}에 내가 한 말` : '내가 고른 문장'}<button class="lnk" data-act="mantra">바꾸기</button></p></section>
${window.VFM_UNIV ? window.VFM_UNIV.html() : ''}
${todoCard()}
${worksStrip()}
<section class="card"><div class="hd"><h2>오늘 ${used}번 열었어요</h2><span class="dim">${used >= 5 ? '오늘 목표를 채웠어요' : `5번까지 ${5 - used}번`}</span></div>
<div class="prog"><i style="width:${Math.min(used / 5, 1) * 100}%"></i></div>
<div class="kv"><div><b>${ns.length}</b><span>쌓인 생각</span></div><div><b>${ns.filter(n => moved(n, wk)).length}</b><span>이번 주</span></div><div><b>${st}일</b><span>연속</span></div><div><b>${links().length}</b><span>연결</span></div></div></section>
${o ? `<section class="card"><div class="hd"><h2>다시 꺼내 본 생각</h2><button class="lnk" data-act="another">다른 생각</button></div>
<button class="old" data-node="${o.id}">${thumb(o, 'big')}<span class="dim">${ago(o.at)} · ${esc(o.g)}</span><b>${esc(o.t)}</b>${S.depth >= 3 && o.s ? `<p>${esc(o.s)}</p>` : ''}</button>
<p class="dim small" style="margin-top:12px">지금 다시 보면 어떤가요? 열어서 고치거나 다른 생각과 이어 보세요.</p></section>` : ''}
${ideas.length ? `<section class="card"><div class="hd"><h2>실행을 기다리는 구상</h2><button class="lnk" data-go="time">전체</button></div>${ideas.map(n => `<button class="item" data-node="${n.id}">${thumb(n)}<span class="rb"><b>${esc(S.depth <= 1 ? n.w || n.t : n.t)}</b><span class="meta">${n.next ? `<span>다음 걸음: ${esc(n.next)}</span>` : (n.needs || []).length ? `<span>욕구: ${esc(n.needs.join(', '))}</span>` : `<span>${esc(n.g)}</span>`}${n.v ? '<mark>평가 있음</mark>' : ''}</span></span><span class="stage s${n.st || 0}">${STAGES[n.st || 0]}</span></button>`).join('')}</section>` : ''}
${contra.length ? `<section class="card"><h2>서로 부딪히는 생각</h2>${contra.map(l => `<div class="pair"><div><button data-node="${l.a}">${esc(node(l.a).w || node(l.a).t)}</button><i>vs</i><button data-node="${l.b}">${esc(node(l.b).w || node(l.b).t)}</button></div>${S.depth > 1 && l.why ? `<p>${esc(l.why)}</p>` : ''}</div>`).join('')}</section>` : ''}
${rep.length ? `<section class="card"><h2>자주 돌아오는 생각</h2>${rep.map(n => card(n)).join('')}</section>` : ''}
<section class="card"><h2>최근에 적은 생각</h2>${ns.length ? `<div class="pgrid">${[...ns].sort(byNew).slice(0, 9).map(n => `<button class="pcard" data-node="${n.id}">${thumb(n)}<b>${esc(S.depth <= 1 ? n.w || n.t : n.t)}</b></button>`).join('')}</div>` : '<p class="empty">아래 칸에 첫 생각을 한 줄 적어 보세요.</p>'}</section>`;
}

// ── 흐름: 날짜순 · 주제별 · 줄기 ───────────────────────────────────────
function viewTime() {
  const m = S.flow || 'date';
  return `<div class="seg sub">${[['date', '날짜순'], ['cal', '달력'], ['topic', '주제별'], ['chain', '줄기']].map(([k, l]) => `<button data-flow="${k}" class="${m === k ? 'on' : ''}">${l}</button>`).join('')}</div>` + (m === 'topic' ? flowTopic() : m === 'chain' ? flowChain() : m === 'cal' ? flowCal() : flowDate());
}
function flowDate() {
  const ns = nodes().sort(byNew), d = S.depth, by = new Map();
  for (const n of ns) { const t = new Date(n.at), k = d <= 1 ? `${t.getFullYear()}년 ${t.getMonth() + 1}월` : `${fmtDay(n.at)} ${'일월화수목금토'[t.getDay()]}요일`; if (!by.has(k)) by.set(k, []); by.get(k).push(n); }
  return [...by].map(([k, list]) => `<section class="card"><div class="hd"><h2>${k}</h2><span class="dim">${list.length}개</span></div>${d <= 1
    ? `<div class="words">${list.map(n => `<button style="background:${pal(n.c)[0]};color:${pal(n.c)[1]}" data-node="${n.id}">${esc(n.w || n.t)}</button>`).join('')}</div>`
    : list.map(n => card(n)).join('')}</section>`).join('') || '<p class="empty">아직 적은 생각이 없습니다.</p>';
}
function flowCal() {
  const ns = nodes(), by = new Map();
  ns.forEach(n => { const k = ymd(new Date(n.at)); if (!by.has(k)) by.set(k, []); by.get(k).push(n); });
  const today = ymd(), cm = S.calM || today.slice(0, 7), [Y, M] = cm.split('-').map(Number);
  const first = new Date(Y, M - 1, 1), days = new Date(Y, M, 0).getDate(), max = Math.max(3, ...[...by].filter(([k]) => k.startsWith(cm)).map(([, l]) => l.length));
  const sel = S.calD && S.calD.startsWith(cm) ? S.calD : (by.has(today) && today.startsWith(cm) ? today : [...by.keys()].filter(k => k.startsWith(cm)).sort().pop());
  const cells = [...Array(first.getDay())].map(() => '<span></span>').concat([...Array(days)].map((_, i) => {
    const k = `${cm}-${String(i + 1).padStart(2, '0')}`, l = by.get(k) || [], pc = l.find(pic);
    return `<button class="cd${k === sel ? ' on' : ''}${k === today ? ' td' : ''}" data-cald="${k}"${l.length ? ` style="--a:${(0.12 + 0.5 * l.length / max).toFixed(2)}"` : ''}>${pc && S.depth >= 3 ? `<img src="${esc(pic(pc))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<b>${i + 1}</b>${l.length ? `<i>${l.length}</i>` : ''}</button>`;
  }));
  const list = (by.get(sel) || []).sort(byNew), todo = sel ? tasks().filter(t => t.due === sel || (t.doneAt && ymd(new Date(t.doneAt)) === sel)) : [];
  return `<section class="card"><div class="hd"><button class="lnk" data-calm="-1" aria-label="이전 달">‹ 이전</button><h2 style="margin:0">${Y}년 ${M}월</h2><button class="lnk" data-calm="1" aria-label="다음 달">다음 ›</button></div>
<div class="calw">${'일월화수목금토'.split('').map(d => `<span>${d}</span>`).join('')}</div><div class="cal">${cells.join('')}</div>
<p class="dim small" style="margin-top:10px">이번 달 ${[...by].filter(([k]) => k.startsWith(cm)).reduce((s, [, l]) => s + l.length, 0)}개. 색이 진할수록 그날 생각을 많이 적었습니다.</p></section>
${sel ? `<section class="card"><h2>${fmtDay(new Date(sel).getTime())} ${'일월화수목금토'[new Date(sel).getDay()]}요일</h2>${list.map(n => card(n)).join('') || '<p class="dim">이날 적은 생각이 없습니다.</p>'}
${todo.length ? `<h3 style="margin:18px 0 6px;font-size:15px">이날의 할 일</h3>${todo.map(t => tRow(t, sel)).join('')}` : ''}</section>` : ''}`;
}
function flowTopic() {
  const groups = new Map();
  nodes().forEach(n => { const k = n.c + '›' + n.g; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(n); });
  const keys = [...groups].sort((a, b) => b[1].length - a[1].length);
  const cur = groups.has(S.topic) ? S.topic : keys[0]?.[0]; if (!cur) return '<p class="empty">아직 적은 생각이 없습니다.</p>';
  const list = groups.get(cur).sort((a, b) => a.at - b.at), [c, g] = cur.split('›');
  return `<div class="chipsc">${keys.map(([k, l]) => `<button data-topic="${esc(k)}" class="${k === cur ? 'on' : ''}" style="--c:${colOf(k.split('›')[0])}">${esc(k.split('›')[1])}<small>${l.length}</small></button>`).join('')}</div>
<section class="card"><p class="dim">${esc(c)}</p><h2 class="big">${esc(g)}</h2><p class="dim">${fmtDay(list[0].at)}부터 ${fmtDay(list.at(-1).at)}까지 ${list.length}개의 생각이 이렇게 흘러왔습니다</p>
<div class="tl">${list.map(n => `<div class="tli"><span class="when">${fmtDay(n.at)}</span>${card(n)}</div>`).join('')}</div></section>`;
}
function adjOf() {
  const adj = new Map(), add = (a, b, l) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push([b, l]); };
  links().forEach(l => { add(l.a, l.b, l); add(l.b, l.a, l); });
  return adj;
}
function chainOf(id, adj) { const seen = new Set([id]), q = [id]; while (q.length) for (const [o] of adj.get(q.shift()) || []) if (!seen.has(o)) { seen.add(o); q.push(o); } return [...seen]; }
function flowChain() {
  const adj = adjOf();
  if (!S.chain || !adj.has(S.chain) || !node(S.chain)) {
    const seen = new Set(), list = [];
    for (const id of adj.keys()) if (!seen.has(id)) { const c = chainOf(id, adj); c.forEach(x => seen.add(x)); const ns = c.map(node).filter(vis); if (ns.length >= 2) list.push(ns.sort((a, b) => a.at - b.at)); }
    list.sort((a, b) => b.length - a.length);
    return `<section class="card"><h2>생각이 이어진 줄기</h2><p class="dim">서로 이어진 생각끼리 묶었습니다. 하나를 고르면 처음 생각부터 어떻게 번졌는지 순서대로 보입니다.</p>
${list.map(ns => { const hub = [...ns].sort((a, b) => adj.get(b.id).length - adj.get(a.id).length)[0]; return `<button class="item" data-chain="${hub.id}">${thumb(hub)}<span class="rb"><b>${esc(hub.t)}</b><span class="meta"><span>${ns.length}개 생각</span><span>${fmtDay(ns[0].at)}부터 ${fmtDay(ns.at(-1).at)}까지</span></span></span></button>`; }).join('') || '<p class="empty">아직 이어진 생각이 없습니다. 생각을 열어 다른 생각과 이어 보세요.</p>'}</section>`;
  }
  const ns = chainOf(S.chain, adj).map(node).filter(vis).sort((a, b) => a.at - b.at);
  return `<section class="card"><button class="lnk" data-chain="">줄기 목록으로</button><h2 class="big" style="margin-top:10px">${esc(node(S.chain).t)}</h2><p class="dim">이 생각과 이어진 ${ns.length}개를 처음부터 순서대로</p>
<div class="tl">${ns.map((n, i) => {
    let via = '';
    const hit = i && (adj.get(n.id) || []).find(([o]) => ns.slice(0, i).some(p => p.id === o));
    if (hit) { const o = node(hit[0]), l = hit[1]; via = `<p class="via ${l.r === 'contra' ? 'red' : ''}">${l.r === 'contra' ? '부딪힘' : '이어짐'}: ${esc(o.w || o.t)}${l.why ? ` · ${esc(l.why)}` : ''}</p>`; }
    return `<div class="tli${n.id === S.chain ? ' me' : ''}">${via}<span class="when">${fmtDay(n.at)}</span>${card(n)}</div>`;
  }).join('')}</div></section>`;
}

const weekKey = (d = new Date()) => { const t = new Date(d); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return ymd(t); };
function viewReview() {
  const ns = nodes(), wk = Date.now() - 7 * DAY, week = ns.filter(n => moved(n, wk));
  const days = [...Array(14)].map((_, i) => ymd(new Date(Date.now() - (13 - i) * DAY)));
  const max = Math.max(6, ...days.map(useOf)), full = days.filter(x => useOf(x) >= 5).length;
  const cats = new Map(); ns.forEach(n => cats.set(n.c, (cats.get(n.c) || 0) + 1));
  const top = [...cats].sort((a, b) => b[1] - a[1]), cmax = top[0]?.[1] || 1;
  const sorted = [...ns].sort((a, b) => a.at - b.at), W = 320, H = 100;
  const t0 = sorted[0]?.at || 0, t1 = Math.max(Date.now(), t0 + 1);
  const pts = sorted.map((n, i) => `${((n.at - t0) / (t1 - t0) * W).toFixed(1)},${(H - (i + 1) / sorted.length * (H - 8)).toFixed(1)}`).join(' ');
  const wg = new Map(); week.forEach(n => wg.set(n.g, (wg.get(n.g) || 0) + 1));
  const revs = all('review').sort((a, b) => b.id.localeCompare(a.id));
  return `<section class="card"><h2 class="big">${ns.length}개가 쌓였고, 가장 큰 덩어리는 ${esc(top[0]?.[0] || '아직 없음')}입니다</h2><p class="dim">${sorted[0] ? fmtDay(t0) + '부터 오늘까지' : ''}</p>
<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;margin-top:14px"><polyline points="0,${H} ${pts} ${W},8" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linejoin="round"/></svg></section>
<section class="card"><div class="hd"><h2>최근 14일 동안 연 횟수</h2><span class="dim">5번 채운 날 ${full}일</span></div><p class="dim small">빨간 점선이 하루 다섯 번입니다</p>
<div class="bars" style="--goal:${5 / max * 100}%">${days.map(x => `<div class="${useOf(x) >= 5 ? 'ok' : ''}" style="height:${useOf(x) / max * 100}%" title="${x}, ${useOf(x)}번"></div>`).join('')}</div></section>
<section class="card"><h2>생각이 몰려 있는 곳</h2>${top.map(([c, n]) => `<div class="hb"><span>${esc(c)}</span><i style="background:${colOf(c)};width:${n / cmax * 100}%"></i><span>${n}</span></div>`).join('')}</section>
<section class="card"><h2>이번 주 돌아보기</h2><p style="margin:0;line-height:1.7">${week.length ? `지난 7일 동안 <b>${week.length}개</b>의 생각이 움직였습니다. 가장 오래 머문 주제는 ${[...wg].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g, n]) => `${esc(g)}(${n})`).join(', ')}입니다.` : '지난 7일 동안 움직인 생각이 없습니다.'}</p>
<div class="btns"><button class="btn pri" data-act="weekly">AI로 회고 쓰기</button><button class="btn" data-act="search">내 생각에 질문하기</button></div>
${revs.map(r => `<p class="dim" style="margin-top:20px">${fmtDay(new Date(r.id.slice(4)).getTime())} 주${r.by ? ' · ' + esc(r.by) : ''}</p><div class="ans">${esc(r.text)}</div>`).join('')}</section>`;
}
async function weekly() {
  const wk = Date.now() - 7 * DAY, week = nodes().filter(n => moved(n, wk));
  if (!week.length) return toast('지난 7일 동안 움직인 생각이 없습니다');
  const r = await busy('이번 주를 돌아보는 중입니다', () => gemT('weekly', `한 사람이 이번 주에 적은 생각 목록이다. 주간 회고를 JSON으로만 답하라. 한국어, 존댓말. 지어내지 말고 목록에 있는 내용만 근거로.
형식: {"text":"회고 본문. 첫 문단: 이번 주 생각이 흐른 방향 2~3문장. 둘째 문단: 반복되거나 서로 부딪힌 생각. 셋째 문단: 다음 주에 실행으로 옮길 만한 한 가지. 문단은 빈 줄로 구분."}

${week.map(n => `- [${n.k}] ${n.t} : ${(n.s || '').slice(0, 120)}${(n.n || 1) > 1 ? ` (${n.n}번)` : ''}`).join('\n')}`), 'weekly');
  if (r?.text) { put({ id: 'rev:' + weekKey(), kind: 'review', text: String(r.text), by: r._by, at: Date.now() }); done(`${r._by}가 이번 주 회고를 썼습니다`, () => go('review')); }
}

// ── 지도: 가운데 '나의 생각'에서 왼쪽·오른쪽으로 퍼지는 마인드맵 ────────────
// 대분류(색 알약) → 주제(밑줄 글자) → 생각(작은 사진 + 한 줄). 가지를 누르면 펼쳐지며 그쪽으로 다가갑니다.
const B = { k: 1, tx: 0, ty: 0, drag: 0, items: [], fitKey: '', ptr: new Map(), pinch: 0 };
const isOpen = (key, lvl) => S.open.has(key) ? true : (S.depth >= lvl && !S.open.has('!' + key));
const tw = (t, px) => [...String(t)].reduce((s, ch) => s + (/[ㄱ-힣一-鿿]/.test(ch) ? px * 0.96 : ch === ' ' ? px * 0.28 : px * 0.56), 0);
function mapItems() {
  const ns = nodes(), d = S.depth, tree = new Map(), at = new Map();
  for (const n of ns) { if (!tree.has(n.c)) tree.set(n.c, new Map()); const g = tree.get(n.c); if (!g.has(n.g)) g.set(n.g, []); g.get(n.g).push(n); }
  const LH = d >= 4 ? 52 : 34, GH = 34, CH = 44, GAP = 8, CGAP = 26;
  const cats = [...tree].map(([c, gs]) => {
    const open = isOpen('c:' + c, 2);
    const groups = [...gs].sort((a, b) => b[1].length - a[1].length).map(([g, l]) => { const go = open && isOpen('g:' + c + '>' + g, 3); return { g, l: l.sort(byNew), open: go, h: go ? Math.max(GH, l.length * LH) : GH }; });
    return { c, groups, open, h: open ? Math.max(CH, groups.reduce((s, x) => s + x.h + GAP, -GAP)) : CH, cnt: [...gs.values()].reduce((s, l) => s + l.length, 0) };
  }).sort((a, b) => b.cnt - a.cnt);
  const sides = [{ dir: 1, h: 0, list: [] }, { dir: -1, h: 0, list: [] }];
  for (const c of cats) { const s = sides[0].h <= sides[1].h ? sides[0] : sides[1]; s.list.push(c); s.h += c.h + CGAP; }
  const RW = tw('나의 생각', 18) + 76, items = [{ x: -RW / 2, y: -27, w: RW, h: 54, cls: 'mroot', html: `나의 생각<small>${ns.length}</small>`, act: 'fit' }], wires = [];
  const curve = (x1, y1, x2, y2, col, w) => { const m = (x1 + x2) / 2; wires.push(`<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}C${m.toFixed(1)} ${y1.toFixed(1)} ${m.toFixed(1)} ${y2.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${col}" stroke-width="${w}"/>`); };
  const under = (x1, x2, y, col, w) => wires.push(`<path d="M${x1.toFixed(1)} ${y.toFixed(1)}H${x2.toFixed(1)}" stroke="${col}" stroke-width="${w}"/>`);
  for (const s of sides) {
    let y = -(s.h - CGAP) / 2;
    for (const c of s.list) {
      const col = colOf(c.c), cw = tw(c.c, 15) + 64, cx = s.dir > 0 ? RW / 2 + 64 : -(RW / 2 + 64) - cw, cy = y + c.h / 2, cEnd = s.dir > 0 ? cx + cw : cx, ck = 'c:' + c.c;
      let gy = y;
      if (c.open) for (const g of c.groups) {
        const gw = Math.min(250, tw(g.g, 14) + 44), gx = s.dir > 0 ? cEnd + 54 : cEnd - 54 - gw, gyc = gy + g.h / 2, gEnd = s.dir > 0 ? gx + gw : gx, gk = 'g:' + c.c + '>' + g.g, base = gyc + GH / 2 - 2;
        items.push({ x: gx, y: gyc - GH / 2, w: gw, h: GH, cls: 'mgrp', st: `--c:${col}`, html: `<span>${esc(g.g)}</span><small>${g.l.length}</small>`, tog: gk, lvl: 3, sub: [ck] });
        under(gx, gx + gw, base, col, 2.2);
        curve(cEnd, cy, s.dir > 0 ? gx : gx + gw, base, col, 2.6);
        if (g.open) g.l.forEach((n, i) => {
          const ly = gy + i * LH, lw = Math.min(d >= 4 ? 300 : 250, tw(n.t, 13.5) + (pic(n) ? (d >= 4 ? 50 : 38) : 14)), lx = s.dir > 0 ? gEnd + 44 : gEnd - 44 - lw, lb = ly + LH - 3;
          items.push({ x: lx, y: ly, w: lw, h: LH, cls: 'mleaf' + (d >= 4 ? ' d4' : '') + ((n.n || 1) > 1 ? ' hot' : ''), node: n.id, sub: [ck, gk],
            html: `${pic(n) ? `<img src="${esc(pic(n))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<span><b>${esc(n.t)}</b>${d >= 4 && n.s ? `<i>${esc(n.s)}</i>` : ''}</span>` });
          under(lx, lx + lw, lb, col, 1.3);
          curve(gEnd, base, s.dir > 0 ? lx : lx + lw, lb, col, 1.4);
          at.set(n.id, [s.dir > 0 ? lx + lw : lx, lb, s.dir]);
        });
        gy += g.h + GAP;
      }
      items.push({ x: cx, y: cy - CH / 2, w: cw, h: CH, cls: 'mcat', st: `--c:${col}`, html: `<span>${esc(c.c)}</span><small>${c.cnt}</small>`, tog: ck, lvl: 2 });
      curve(s.dir > 0 ? RW / 2 - 4 : -RW / 2 + 4, 0, s.dir > 0 ? cx : cx + cw, cy, col, 4.5);
      y += c.h + CGAP;
    }
  }
  for (const l of links()) {
    if (l.r !== 'contra') continue;
    const a = at.get(l.a), b = at.get(l.b); if (!a || !b) continue;
    const bend = (a[2] + b[2]) * 90;
    wires.push(`<path class="contra" d="M${a[0].toFixed(0)} ${a[1].toFixed(0)}Q${((a[0] + b[0]) / 2 + bend).toFixed(0)} ${((a[1] + b[1]) / 2).toFixed(0)} ${b[0].toFixed(0)} ${b[1].toFixed(0)}"/>`);
  }
  return { items, wires };
}
function drawMap() {
  const { items, wires } = mapItems(); B.items = items;
  $('#main').innerHTML = `<div id="bd"><div id="world"><svg id="wires">${wires.join('')}</svg>${items.map(i => { const tag = i.node || i.tog || i.act ? 'button' : 'div'; return `<${tag} class="nd ${i.cls}" style="left:${i.x.toFixed(0)}px;top:${i.y.toFixed(0)}px;width:${i.w.toFixed(0)}px;height:${i.h.toFixed(0)}px;${i.st || ''}"${i.node ? ` data-node="${i.node}"` : ''}${i.tog ? ` data-tog="${esc(i.tog)}" data-lvl="${i.lvl}"` : ''}${i.act ? ` data-act="${i.act}"` : ''}>${i.html}</${tag}>`; }).join('')}</div></div>
<p class="bdhint">${matchMedia('(pointer:coarse)').matches ? '끌어서 이동, 두 손가락으로 확대. 가지를 누르면 펼쳐집니다.' : '끌어서 이동, 휠로 확대. 가지를 누르면 펼쳐집니다.'}</p>
<div class="bdui">${innerWidth < 700 ? '<button data-act="mapPhone">간단히</button>' : ''}<button data-act="fit">전체</button><button data-act="zout" aria-label="축소">−</button><span id="zoomPct"></span><button data-act="zin" aria-label="확대">+</button></div>`;
  const bd = $('#bd');
  bd.addEventListener('pointerdown', e => { B.ptr.set(e.pointerId, [e.clientX, e.clientY]); if (B.ptr.size === 1) B.drag = 0; B.pinch = 0; });
  bd.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);                       // 노트북 터치패드 벌리기
    else if (e.deltaMode || (Math.abs(e.deltaY) >= 50 && !e.deltaX)) zoomAt(e.deltaY < 0 ? 1.15 : 0.87, e.clientX, e.clientY);   // 마우스 휠
    else { B.tx -= e.deltaX; B.ty -= e.deltaY; applyT(); }                                          // 터치패드 두 손가락 이동
  }, { passive: false });
  const key = 'map' + S.depth + S.unlocked + nodes().length;
  if (B.fitKey !== key) { B.fitKey = key; fitBoard(false); } else applyT();
}
function applyT(anim) {
  const w = $('#world'), bd = $('#bd'); if (!w) return;
  w.style.transition = anim ? 'transform .38s cubic-bezier(.2,.8,.2,1)' : '';
  w.style.transform = `translate(${B.tx}px,${B.ty}px) scale(${B.k})`;
  $('#zoomPct').textContent = Math.round(B.k * 100) + '%';
}
function frame(list, kMax = 1.1, kMin = 0.04, anim) {
  const bd = $('#bd'); if (!bd || !list.length) return applyT();
  const W = bd.clientWidth, H = bd.clientHeight - 56;
  const x0 = Math.min(...list.map(i => i.x)), x1 = Math.max(...list.map(i => i.x + i.w)), y0 = Math.min(...list.map(i => i.y)), y1 = Math.max(...list.map(i => i.y + i.h));
  B.k = Math.max(kMin, Math.min(kMax, W / (x1 - x0 + 48), H / (y1 - y0 + 48)));
  let cy = (y0 + y1) / 2; if ((y1 - y0) * B.k > H - 48) cy = y0 + (H / 2 - 24) / B.k;   // 다 안 들어가면 위쪽부터
  B.tx = W / 2 - (x0 + x1) / 2 * B.k; B.ty = 12 + H / 2 - cy * B.k;
  applyT(anim);
}
function fitBoard(all_, anim) {
  const W = $('#bd')?.clientWidth || 400, its = B.items;
  if (all_) return frame(its, 1.1, 0.04, anim);
  // 처음 열 때: 다 보여도 글씨가 읽히면 전체, 아니면 '나의 생각'과 대분류까지만 읽히는 크기로
  const x0 = Math.min(...its.map(i => i.x)), x1 = Math.max(...its.map(i => i.x + i.w)), y0 = Math.min(...its.map(i => i.y)), y1 = Math.max(...its.map(i => i.y + i.h));
  const k = Math.min(W / (x1 - x0 + 48), ($('#bd').clientHeight - 104) / (y1 - y0 + 48));
  frame(k >= 0.62 ? its : its.filter(i => i.cls === 'mroot' || i.cls === 'mcat'), 1.1, W < 700 ? 0.85 : 0.6, anim);   // 폰에서는 글씨가 읽히는 크기를 먼저
}
function focusOn(key) {
  const list = B.items.filter(i => i.tog === key || i.sub?.includes(key));
  if (list.length > 1) frame(list, 1.15, ($('#bd')?.clientWidth || 800) < 700 ? 0.85 : 0.6, true);
}
function zoomAt(f, cx, cy) {
  const r = $('#bd').getBoundingClientRect(), ox = (cx ?? r.left + r.width / 2) - r.left, oy = (cy ?? r.top + r.height / 2) - r.top, nk = Math.min(3, Math.max(0.04, B.k * f)); f = nk / B.k;
  B.tx = ox - (ox - B.tx) * f; B.ty = oy - (oy - B.ty) * f; B.k = nk; applyT();
}
addEventListener('pointermove', e => {
  const p = B.ptr.get(e.pointerId); if (!p || !$('#bd')) return;
  if (B.ptr.size === 1) { B.tx += e.clientX - p[0]; B.ty += e.clientY - p[1]; B.drag += Math.abs(e.clientX - p[0]) + Math.abs(e.clientY - p[1]); }
  B.ptr.set(e.pointerId, [e.clientX, e.clientY]);
  if (B.ptr.size === 2) { const [a, b] = [...B.ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (B.pinch) zoomAt(d / B.pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); B.pinch = d; B.drag = 99; }
  applyT();
});
const ptrEnd = e => { B.ptr.delete(e.pointerId); B.pinch = 0; };
addEventListener('pointerup', ptrEnd); addEventListener('pointercancel', ptrEnd);

// ── 폰 지도: 한 번에 한 단계씩, 가운데 원에서 둘레의 원으로 들어가는 '궤도' 지도 ──
// 나의 생각 → 대분류 → 주제 → 생각. 원을 누르면 그 안으로 들어가고, 뒤로가기나 위쪽 경로로 나옵니다.
function orbitData() {
  const ns = nodes(), [c, g] = S.mpath ||= [], group = (l, k) => { const m = new Map(); l.forEach(n => { if (!m.has(n[k])) m.set(n[k], []); m.get(n[k]).push(n); }); return [...m].sort((a, b) => b[1].length - a[1].length); };
  if (!c || !ns.some(n => n.c === c)) { S.mpath = []; return { lvl: 0, t: '나의 생각', n: ns.length, col: 'var(--ink)', kids: group(ns, 'c').map(([k, l]) => ({ key: k, t: k, n: l.length, col: colOf(k), l })) }; }
  const lc = ns.filter(n => n.c === c);
  if (!g || !lc.some(n => n.g === g)) { S.mpath = [c]; return { lvl: 1, t: c, n: lc.length, col: colOf(c), kids: group(lc, 'g').map(([k, l]) => ({ key: k, t: k, n: l.length, col: colOf(c), l })) }; }
  const lg = lc.filter(n => n.g === g).sort((a, b) => (b.n || 1) - (a.n || 1) || byNew(a, b));
  return { lvl: 2, t: g, n: lg.length, col: colOf(c), kids: lg.map(n => ({ node: n, t: S.depth <= 1 ? n.w || n.t : n.t, col: colOf(c) })) };
}
function viewOrbit() {
  const D = orbitData(), all_ = D.kids, more = all_.length > 14 ? all_.length - 13 : 0, kids = more ? all_.slice(0, 13) : all_;
  const two = kids.length + (more ? 1 : 0) > 8, n1 = two ? Math.ceil((kids.length + (more ? 1 : 0)) * 0.4) : kids.length + (more ? 1 : 0);
  const pos = i => { const ring = i < n1 ? 0 : 1, k = ring ? i - n1 : i, cnt = ring ? kids.length + (more ? 1 : 0) - n1 : n1, r = two ? (ring ? 41 : 24) : 35, a = -Math.PI / 2 + (k + (ring ? 0.5 : 0)) / cnt * 2 * Math.PI;
    return { x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a), s: two ? (ring ? 16.5 : 18) : 22 }; };
  const P = [...kids, ...(more ? [{ more }] : [])].map((k, i) => ({ ...k, ...pos(i), i }));
  const crumbs = ['나의 생각', ...S.mpath];
  return `<nav class="crumb">${crumbs.map((x, i) => i === crumbs.length - 1 ? `<b>${esc(x)}</b>` : `<button data-mto="${i}">${esc(x)}</button><i>›</i>`).join('')}</nav>
<div class="orb" style="--col:${D.col}">
<svg class="orb-l" viewBox="0 0 100 100" aria-hidden="true">${P.map(p => `<line x1="50" y1="50" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="${p.more ? 'var(--line)' : p.col}" stroke-width=".5" stroke-opacity=".6"/>`).join('')}</svg>
<button class="oc" style="width:${two ? 22 : 30}%" ${D.lvl ? 'data-mto="' + (D.lvl - 1) + '" aria-label="한 단계 위로"' : 'disabled'}>${esc(D.t)}<small>${D.n}개</small></button>
${P.map(p => { const st = `left:${p.x.toFixed(1)}%;top:${p.y.toFixed(1)}%;width:${p.s}%;--c:${p.col || 'var(--dim)'};--d:${p.i}`;
    if (p.more) return `<a class="ob" style="${st}" href="#orbList"><span>+${p.more}</span><small>아래 목록</small></a>`;
    if (p.node) { const n = p.node, im = pic(n); return `<button class="ob${im ? ' ph' : ''}" style="${st}" data-node="${n.id}">${im ? `<img src="${esc(im)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<span>${esc(p.t)}</span>${(n.n || 1) > 1 ? `<small>${n.n}번</small>` : ''}</button>`; }
    return `<button class="ob" style="${st}" data-mk="${esc(p.key)}"><span>${esc(p.t)}</span><small>${p.n}</small></button>`; }).join('')}
</div>
<p class="dim small" style="text-align:center;margin:2px 0 0">${D.lvl < 2 ? '원을 누르면 안으로 들어갑니다. 뒤로가기로 나옵니다.' : '원을 누르면 그 생각이 열립니다.'}</p>
<section class="card" id="orbList"><h2>${D.lvl < 2 ? `${esc(D.t)} 안의 ${D.lvl ? '주제' : '분류'} ${all_.length}개` : `${esc(D.t)}의 생각 ${all_.length}개`}</h2>
${D.lvl < 2 ? all_.map(k => `<button class="item" data-mk="${esc(k.key)}"><span class="th tile" style="background:${pal(D.lvl ? S.mpath[0] : k.key)[0]};color:${k.col};font-size:15px">${k.n}</span><span class="rb"><b>${esc(k.t)}</b>${S.depth >= 2 ? `<span class="meta"><span>${esc([...k.l].sort(byNew)[0].t)}</span></span>` : ''}</span></button>`).join('') : all_.map(k => card(k.node)).join('')}</section>
<div style="text-align:center;margin-top:14px"><button class="lnk" data-act="mapFull">크게 펼친 지도로 보기</button></div>`;
}
function orbitTo(i) { const k = (S.mpath || []).length - i; if (k > 0) { S.popN = k; history.go(-k); } }

// ── 화면 그리기와 뒤로가기 ────────────────────────────────────────────
// 뒤로가기는 "창 닫기 → 이전 화면 → 첫 화면" 순서로만 움직이고 사이트 밖으로 나가지 않습니다.
const NAV = [], SH = [];
const TITLES = { home: '홈', todo: '할 일', works: '작품', map: '지도', time: '흐름', review: '회고' };
function render() {
  if (!S.user) return;
  $('#ttl').textContent = TITLES[S.view] || '홈';
  document.querySelectorAll('#depthSeg button').forEach(b => b.classList.toggle('on', +b.dataset.depth === S.depth));
  $('#lockBtn').classList.toggle('on', S.unlocked); $('#lockBtn').setAttribute('aria-label', S.unlocked ? '잠금 영역 닫기' : '잠금 영역 열기');
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.go === S.view));
  const phoneMap = S.view === 'map' && innerWidth < 700 && !S.mapFull, board = S.view === 'map' && !phoneMap;
  $('#main').className = board ? 'board' : ''; $('#app').classList.toggle('wide', board);
  if (board) return drawMap();
  const top = $('#main').scrollTop;
  $('#main').innerHTML = phoneMap ? viewOrbit() : S.view === 'todo' ? viewTodo() : S.view === 'works' ? viewWorks() : S.view === 'time' ? viewTime() : S.view === 'review' ? viewReview() : viewHome();
  $('#main').scrollTop = top;
}
const stamp = () => history.pushState({ tfm: NAV.length }, '');
function go(v) {
  if (v === S.view) return;
  if (S.view === 'home') { NAV.push('home'); stamp(); }   // 탭은 한 겹만 쌓음: 어느 탭에서든 뒤로가기 한 번이면 '오늘'
  S.view = v; if (v === 'todo' && S.qm !== 'urgent') setQm('todo'); else if (v === 'works') setQm('work'); else if (S.qm === 'todo' || S.qm === 'work') setQm('think');
  render(); $('#main').scrollTop = 0;
}
function show(key, fn) {
  fn.key = key;
  if (SH.length && SH[SH.length - 1].key === key) SH[SH.length - 1] = fn; else { SH.push(fn); NAV.push('sheet'); stamp(); }
  fn();
}
const closeAll = () => { if (SH.length) { S.popN = SH.length; history.go(-SH.length); } };
addEventListener('popstate', () => {
  let n = S.popN || 1; S.popN = 0;
  while (n-- > 0) {
    const e = NAV.pop();
    if (e === undefined) { stamp(); if (S.view !== 'home') { S.view = 'home'; } else toast('첫 화면입니다', null, null, 1500); break; }
    if (e === 'sheet') SH.pop(); else if (e === 'lvl') (S.mpath ||= []).pop(); else S.view = e;
  }
  S.pick = null;
  if (SH.length) SH[SH.length - 1](); else $('#sheet').hidden = true;
  render();
  if (!SH.length && S.after) { const f = S.after; S.after = null; f(); }
});

// ── 창(아래에서 올라오는 시트) ────────────────────────────────────────
function sheet(html) { $('#sheetBox').innerHTML = html; setTimeout(markBusy); $('#sheet').hidden = false; $('#sheetBox').scrollTop = 0; }
function toast(msg, act, fn, ms = 5000) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
  if (act) { const b = document.createElement('button'); b.textContent = act; b.onclick = () => { el.remove(); fn(); }; el.append(b); }
  const box = $('#toasts'); [...box.children].filter(c => c.textContent === el.textContent).forEach(c => c.remove());
  while (box.children.length > 2) box.firstChild.remove();
  box.append(el); setTimeout(() => el.remove(), ms); return el;
}
const openNode = id => { if (node(id)) show('node:' + id, () => drawNode(id)); };
async function drawNode(id) {
  const n = node(id); if (!n) return history.back();
  S.sel = id;
  const ls_ = linksOf(id), [bg, fg] = pal(n.c);
  const v = n.v;
  sheet(`<div class="grab"></div>${n.ph ? '<div id="photo"></div>' : n.img ? `<img class="cover" src="${esc(n.img)}" alt="" referrerpolicy="no-referrer">` : ''}
<div class="chips" style="margin-top:0"><span class="chip" style="background:${bg};color:${fg}">${esc(n.c)}</span><span class="chip">${esc(n.g)}</span><span class="chip">${esc(n.k)}</span><span class="chip">${STAGES[n.st || 0]}</span><span class="chip">${fmtDay(n.at)}</span>${(n.n || 1) > 1 ? `<span class="chip need">${n.n}번 떠올림</span>` : ''}${n.p ? '<span class="chip">잠금 영역</span>' : ''}</div>
<p class="ttl">${esc(n.t)}</p>
<div class="rb">${body(n, 5, true).replace(/^<b>.*?<\/b>/, '')}</div>
${n.url ? `<p class="dim" style="margin-top:10px"><a href="${esc(n.url)}" target="_blank" rel="noopener">원본 열기</a>${n.imgSrc ? ` &nbsp; <a href="${esc(n.imgSrc)}" target="_blank" rel="noopener">사진 출처</a>` : ''}</p>` : n.imgSrc ? `<p class="dim" style="margin-top:10px"><a href="${esc(n.imgSrc)}" target="_blank" rel="noopener">사진 출처</a></p>` : ''}
<section class="evalbox"><div class="hd"><h3>세 관점과 사람들의 욕구</h3>${v ? '<button class="lnk" data-act="persp">다시 평가</button>' : ''}</div>
${v ? views(v) + `<p class="dim small" style="margin-top:10px">${v.by ? esc(v.by) + '가 ' : ''}${v.at ? fmtDay(v.at) + '에 ' : ''}평가해 이 카드에 저장했습니다</p>` : '<p class="dim">투자자·고객·경쟁자의 눈으로 이 생각을 보고, 사람들이 어떤 욕구로 원할지 평가합니다. 결과는 이 카드에 저장됩니다.</p><button class="btn pri wide" data-act="persp">평가 받기</button>'}</section>
<div class="btns"><button class="btn" data-act="organize">AI로 정리</button><button class="btn" data-act="chainGo">줄기 보기</button><button class="btn" data-act="toPlanner">할 일로 만들기</button></div>
<h3>이어진 생각 ${ls_.length}개</h3>
${ls_.map(({ l, o }) => `<div class="lk"><button data-node="${o.id}">${esc(o.t)}${l.why ? `<small>${esc(l.why)}</small>` : ''}</button><button class="chip ${l.r === 'contra' ? 'red' : ''}" data-act="linkType" data-id="${l.id}">${l.r === 'contra' ? '부딪힘' : '관련'}</button><button class="chip" data-act="linkDel" data-id="${l.id}">끊기</button></div>`).join('')}
<div class="btns"><button class="btn" data-act="linkAdd">다른 생각과 잇기</button></div>
${(n.todo || []).length ? `<h3>플래너로 보낸 일</h3>${n.todo.map(t => `<p class="hint">${fmtDay(t.at)}, ${esc(t.title)}</p>`).join('')}` : ''}
<h3>이 생각 다루기</h3>
<div class="btns" style="margin-top:0"><button class="btn" data-act="edit">고치기</button><button class="btn" data-act="imgPick">그림 찾기</button><label class="btn">내 사진 올리기<input type="file" accept="image/*" id="photoIn" hidden></label>${pic(n) ? '<button class="btn" data-act="imgDrop">그림 빼기</button>' : ''}<button class="btn" data-act="togglePrivate">${n.p ? '잠금 영역에서 꺼내기' : '잠금 영역으로 옮기기'}</button><button class="btn red" data-act="del">지우기</button></div>`);
  if (n.ph) {
    let ph = S.items.get('ph_' + id);
    if (!ph && sb) { const { data } = await sb.from('think_items').select('id,kind,data,updated_at,deleted').eq('id', 'ph_' + id).maybeSingle(); if (data && !data.deleted) { ph = fromRow(data); S.items.set(ph.id, ph); } }
    if (S.sel === id && $('#photo')) $('#photo').innerHTML = `<img class="cover" src="${ph?.img || n.th || ''}" alt="">`;
  }
}
const editNode = id => show('edit', () => {
  const n = node(id), cats = [...new Set(all('node').map(x => x.c))], grps = [...new Set(all('node').map(x => x.g))];
  sheet(`<h2>고치기</h2>
<label class="f">핵심 단어<input id="e_w" value="${esc(n.w || '')}" maxlength="12"></label>
<label class="f">한 줄<input id="e_t" value="${esc(n.t)}" maxlength="140"></label>
<label class="f">요약<textarea id="e_s">${esc(n.s || '')}</textarea></label>
<label class="f">상세<textarea id="e_d">${esc(n.d || '')}</textarea></label>
<div class="line"><label class="f">대분류<input id="e_c" list="dl_c" value="${esc(n.c)}"><datalist id="dl_c">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
<label class="f">연결 주제<input id="e_g" list="dl_g" value="${esc(n.g)}"><datalist id="dl_g">${grps.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label></div>
<div class="line"><label class="f">종류<select id="e_k">${Object.keys(KINDS).map(k => `<option ${k === n.k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
<label class="f">단계<select id="e_st">${STAGES.map((s, i) => `<option value="${i}" ${i === (n.st || 0) ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div>
<label class="f">사람들의 욕구 (쉼표로 구분: ${NEEDS.join(', ')})<input id="e_needs" value="${esc((n.needs || []).join(', '))}"></label>
<label class="f">다음 한 걸음<input id="e_next" value="${esc(n.next || '')}"></label>
<label class="f">원본 주소<input id="e_url" value="${esc(n.url || '')}" inputmode="url"></label>
<div class="btns"><button class="btn pri" data-act="save">고친 내용 저장</button><button class="btn" data-act="back">그만두기</button></div>`);
});
function saveNode(id) {
  const n = node(id), v = k => $('#e_' + k).value.trim();
  if (v('t') !== n.t || v('s') !== (n.s || '')) (n.hist ||= []).push({ at: Date.now(), t: n.t, s: n.s });
  Object.assign(n, { w: v('w'), t: v('t') || n.t, s: v('s'), d: v('d'), c: v('c') || '미분류', g: v('g') || '새 생각', k: v('k'), st: +v('st'), needs: v('needs').split(/[,·\s]+/).filter(x => NEEDS.includes(x)), next: v('next'), url: v('url') });
  if (!n.img && yt(n.url)) n.img = yt(n.url);
  put(n, true); toast('고친 내용을 저장했습니다'); history.back();
}
const openSearch = pick => show('search', () => {
  S.pick = pick || null;
  sheet(`<h2>${pick ? '이을 생각 고르기' : '찾기'}</h2><input class="in" id="q" placeholder="${pick ? '단어로 찾기' : '단어로 찾거나, 문장으로 질문하기'}" autocomplete="off">
${pick ? '' : '<div class="btns"><button class="btn pri" data-act="askQ">이 문장으로 AI에게 묻기</button></div>'}<div id="ans"></div><div id="res" style="margin-top:8px"></div>`);
  const run = () => {
    const q = $('#q').value.trim().toLowerCase();
    const hit = nodes().filter(n => n.id !== pick && (!q || [n.t, n.s, n.w, n.c, n.g, n.raw, n.d].join(' ').toLowerCase().includes(q))).sort(byNew).slice(0, 40);
    $('#res').innerHTML = hit.map(n => pick ? `<button class="item" data-pick="${n.id}">${thumb(n)}<span class="rb"><b>${esc(n.t)}</b></span></button>` : card(n, Math.max(2, S.depth))).join('') || '<p class="empty">찾은 생각이 없습니다. 다른 단어로 찾아 보세요.</p>';
  };
  $('#q').oninput = run; run();
});
async function ask(q) {
  if (!q) return toast('물어볼 문장을 먼저 적어 주세요');
  const r = await busy('내 생각들을 읽는 중입니다', () => gemT('ask', `아래는 한 사람의 생각 노트 목록(id|한 줄|요약)이다. 이 목록만 근거로 질문에 답하라. 목록에 없으면 없다고 말하라. 한국어 존댓말. JSON으로만: {"answer":"답 3~6문장","ids":["근거가 된 생각 id 최대 6개"]}

[질문] ${q}

[목록]
${corpus()}`), 'ask');
  if (!r || !$('#ans')) return;
  $('#ans').innerHTML = `<div class="ans">${esc(r.answer)}</div>`;
  $('#res').innerHTML = (r.ids || []).map(node).filter(vis).map(n => card(n, 3)).join('');
}
const mantraBtn = t => `<button class="item" data-mantra="${esc(t)}"><span class="rb"><b>${esc(t)}</b></span></button>`;
const openMantra = () => show('mantra', () => {
  const cand = [...new Set([...nodes().filter(n => (n.n || 1) > 1).sort((a, b) => b.n - a.n), ...nodes().filter(n => n.k === '의견' || n.k === '생각').sort(byNew)].slice(0, 8).map(n => n.t))];
  sheet(`<h2>오늘 되뇔 문장</h2><p class="hint">내가 한 말 중에서 고르거나 직접 적습니다.</p>
<div id="mlist">${cand.map(mantraBtn).join('')}</div>
<label class="f">직접 적기<input id="m_in" value="${esc(settings().mantra || '')}" maxlength="80"></label>
<div class="btns"><button class="btn pri" data-act="mantraSave">이 문장으로 정하기</button><button class="btn" data-act="mantraAi">AI에게 후보 받기</button></div>`);
});
async function mantraAi() {
  const r = await busy('후보 문장을 뽑는 중입니다', () => gemT('mantra', `아래는 한 사람이 직접 한 생각들이다. 이 사람이 매일 되뇔 만한 문장 후보 5개를 그 사람의 말투와 내용에서 뽑아라. 각 30자 이내, 지어내지 말고 생각에 근거. JSON으로만: {"list":["...","..."]}

${nodes().filter(n => n.k !== '자료').sort((a, b) => (b.n || 1) - (a.n || 1) || byNew(a, b)).slice(0, 60).map(n => `- ${n.t}${(n.n || 1) > 1 ? ` (${n.n}번)` : ''}`).join('\n')}`), 'mantra');
  if (r?.list && $('#mlist')) $('#mlist').innerHTML = r.list.map(mantraBtn).join('');
}
const setMantra = t => { const s = settings(); s.mantra = t.trim(); s.mantraFrom = nodes().find(n => n.t === s.mantra)?.id || ''; put(s, true); toast('되뇔 문장을 정했습니다'); history.back(); };

// ── 그림: 유튜브 썸네일, 위키미디어 공용 사진, 내 사진 ──────────────────
const yt = u => { const m = String(u || '').match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/)([\w-]{11})/); return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : ''; };
async function commons(q, n = 12) {
  const res = await fetch('https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=' + n + '&gsrsearch=' + encodeURIComponent(q + ' filetype:bitmap') + '&prop=imageinfo&iiprop=url%7Cmime&iiurlwidth=480');
  if (!res.ok) throw new Error('사진 서버가 응답하지 않습니다');
  const j = await res.json();
  return Object.values(j.query?.pages || {}).sort((a, b) => a.index - b.index).map(p => p.imageinfo?.[0]).filter(i => i && /jpe?g|png/.test(i.mime) && i.thumburl).map(i => ({ th: i.thumburl, page: i.descriptionurl }));
}
const openImg = id => show('img', () => {
  const n = node(id);
  sheet(`<h2>그림 찾기</h2><p class="hint">위키미디어 공용의 자유 이용 사진에서 찾습니다. 영어 낱말이 잘 맞습니다.</p>
<form id="imgF" class="line" style="margin-top:12px"><input class="in" id="imgQ" value="${esc(n.kw || n.w || '')}" style="flex:1;margin:0"><button class="btn pri">찾기</button></form><div class="grid" id="imgR"></div>`);
  const run = async () => {
    $('#imgR').innerHTML = '<p class="empty">찾는 중입니다.</p>';
    try { const r = await commons($('#imgQ').value.trim(), 18); if ($('#imgR')) $('#imgR').innerHTML = r.map(x => `<button data-img="${esc(x.th)}" data-src="${esc(x.page)}"><img src="${esc(x.th)}" alt="" loading="lazy"></button>`).join('') || '<p class="empty">맞는 사진이 없습니다. 다른 낱말로 찾아 보세요.</p>'; }
    catch { if ($('#imgR')) $('#imgR').innerHTML = '<p class="empty">사진을 불러오지 못했습니다. 잠시 뒤 다시 찾아 보세요.</p>'; }
  };
  $('#imgF').onsubmit = e => { e.preventDefault(); run(); };
  if ($('#imgQ').value) run();
});
async function fillImages() {
  const list = all('node').filter(n => !pic(n) && (n.kw || n.w));
  if (!list.length) return toast('모든 생각에 이미 그림이 있습니다');
  const t = toast(`그림을 붙이는 중입니다 0/${list.length}`, null, null, 900000);
  let ok = 0, fail = 0;
  for (const [i, n] of list.entries()) {
    try { const r = await commons(n.kw || n.w, 3); if (r[0]) { n.img = r[0].th; n.imgSrc = r[0].page; put(n, true); ok++; } fail = 0; }
    catch { if (++fail >= 4) break; }
    t.textContent = `그림을 붙이는 중입니다 ${i + 1}/${list.length}`;
    await new Promise(r => setTimeout(r, 300));
  }
  t.remove();  render();
  toast(fail >= 4 ? `사진 서버가 응답하지 않아 ${ok}개에서 멈췄습니다. 잠시 뒤 다시 눌러 주세요.` : `그림 ${ok}개를 붙였습니다`);
}

// ── 설정 ─────────────────────────────────────────────────────────────
const openSettings = () => show('settings', drawSettings);
function drawSettings() {
  const s = settings();
  sheet(`<h2>설정</h2>
<div><b>${esc(S.user.email || '')}</b><div class="btns"><button class="btn" data-act="logout">로그아웃</button><a class="btn" href="${CFG.vending}">자판기 열기</a><a class="btn" href="${CFG.quest}">한 달 퀘스트</a></div><p class="hint" style="margin-bottom:0">자판기·플래너와 로그인을 함께 씁니다. 여기서 로그아웃하면 그쪽도 로그아웃됩니다.</p></div>
${IP ? '<div class="btns" style="margin-top:0"><button class="btn pri" data-act="install">이 기기에 앱으로 설치</button></div>' : ''}
<h3>AI</h3><p class="dim">정리·분류는 Gemini, 세 관점 평가와 주간 회고는 Claude, 질문과 만트라는 Grok이 먼저 맡습니다. 키가 없거나 막히면 다음 AI가 대신합니다.</p>
${Object.entries(PROV).map(([p, P]) => `<div class="line"><label class="f">${P.name} 키${P.paid ? '' : ' (무료)'}<input id="k_${p}" type="password" autocomplete="off" value="${esc(s[P.key] || '')}" placeholder="${p === 'gemini' ? 'AIza…' : p === 'claude' ? 'sk-ant-…' : 'xai-…'}"></label><label class="f">모델<input id="m_${p}" value="${esc(s[P.model] || P.def)}"></label></div>`).join('')}
<label class="f">Claude·Grok 월 한도 (달러)<input id="s_cap" type="number" min="1" step="1" value="${cap()}"></label>
<div class="prog" style="margin:14px 0 8px"><i style="width:${Math.min(spent() / cap(), 1) * 100}%"></i></div>
<p class="dim small">이번 달 Claude ${usd(spendOf().claude)}, Grok ${usd(spendOf().grok)}, 합계 ${usd(spent())} / ${usd(cap())}. 응답에 적힌 글자 수(토큰)로 계산한 추정치이며, 한도에 닿으면 Gemini만 씁니다.</p>
<div class="btns"><button class="btn pri" data-act="aiSave">AI 설정 저장</button></div>
<h3>알림</h3><div id="notis">${notisHtml(s)}</div>
<div class="btns"><button class="btn" data-act="notiAdd">＋ 알림 추가</button><button class="btn pri" data-act="pushOn">이 기기에서 알림 켜기</button><button class="btn" data-act="pushTest">테스트</button><button class="btn" data-act="pushOff">이 기기 끄기</button></div>
<h3>잠금 영역</h3><div><p style="margin:0">가족·건강처럼 사적인 생각은 위쪽 '잠금'을 눌러야 보입니다. ${s.pin ? '비밀번호가 걸려 있습니다.' : '비밀번호는 없습니다.'}</p><div class="btns"><button class="btn" data-act="pinSet">${s.pin ? '비밀번호 바꾸기' : '비밀번호 걸기'}</button>${s.pin ? '<button class="btn" data-act="pinClear">비밀번호 없애기</button>' : ''}</div></div>
<h3>할 일</h3><label class="f">시간 블록 알림<select data-act="remind" onchange="ACT.remind(this)">${[[-1, '알리지 않음'], [0, '시작할 때'], [5, '5분 전'], [10, '10분 전'], [15, '15분 전'], [30, '30분 전']].map(([v, l]) => `<option value="${v}" ${(s.remindMin ?? 5) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
<p class="dim small" style="margin-top:8px">아래 '이 기기에서 알림 켜기'를 해 둔 기기로 옵니다. 5분 단위로 확인합니다.</p>
<p class="f">구글 캘린더</p>${gOn() ? '<p class="dim">연결됨. 시간 블록이 구글 캘린더에 올라가고, 캘린더의 다른 일정이 시간표에 함께 보입니다.</p><div class="btns"><button class="btn" data-act="gOff">연결 끄기</button></div>' : GC.state === 'expired' ? '<p class="dim">연결이 끊겼습니다. 다시 연결해 주세요.</p><div class="btns"><button class="btn pri" data-act="gConnect">다시 연결</button></div>' : '<p class="dim">연결하면 시간 블록이 구글 캘린더에 올라가고, 캘린더의 다른 일정이 시간표에 함께 보입니다. 구글 로그인 창이 한 번 뜹니다.</p><div class="btns"><button class="btn pri" data-act="gConnect">구글 캘린더 연결</button></div>'}
<h3>자판기</h3><p class="hint">자판기에서 남긴 생각, 질문, 메모, 별표와 좋아요한 글을 '자판기에서' 가지로 가져옵니다. 열 때마다 새 것만 자동으로 들어옵니다.</p><div class="btns"><button class="btn" data-act="vfmPull">지금 가져오기</button></div>
<h3>그림</h3><p class="hint">그림이 없는 생각에 위키미디어 공용의 자유 이용 사진을 하나씩 붙입니다. 마음에 안 드는 것은 생각을 열어 바꿀 수 있습니다.</p><div class="btns"><button class="btn" data-act="fillImages">그림 없는 생각에 사진 붙이기</button></div>
<h3>기록</h3><div class="btns"><button class="btn" data-act="export">전체 기록 내려받기 (JSON)</button></div>
<p class="hint">폰에 설치: 안드로이드 Chrome 메뉴 → 앱 설치 · 아이폰 Safari 공유 → 홈 화면에 추가. 알림은 설치한 앱에서 켭니다.</p>`);
}
const notisHtml = s => (s.notis || []).map((n, i) => `<div class="noti"><div class="line"><input type="checkbox" data-noti="${i}" data-k="on" ${n.on !== false ? 'checked' : ''}><select data-noti="${i}" data-k="kind">${Object.entries(NOTI).map(([k, v]) => `<option value="${k}" ${k === n.kind ? 'selected' : ''}>${v}</option>`).join('')}</select><input type="time" step="300" data-noti="${i}" data-k="time" value="${esc(n.time)}"><button class="chip" data-act="notiDel" data-id="${i}" style="margin-left:auto">삭제</button></div><div class="days">${'월화수목금토일'.split('').map((d, j) => `<button data-day="${i}:${j + 1}" class="${(n.days || []).includes(j + 1) ? 'on' : ''}">${d}</button>`).join('')}</div></div>`).join('') || '<p class="empty">알림이 없습니다.</p>';
function notiChange(fn) { const s = settings(); s.notis ||= []; fn(s.notis); put(s, true); if ($('#notis')) $('#notis').innerHTML = notisHtml(s); }
const round5 = t => { const [h, m] = t.split(':').map(Number); return `${String(h).padStart(2, '0')}:${String(Math.floor(m / 5) * 5).padStart(2, '0')}`; };

const b64ToU8 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
async function pushOn() {
  if (!sb) return toast('지금은 켤 수 없습니다');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return toast('이 브라우저는 알림을 지원하지 않습니다. 홈 화면에 설치한 뒤 다시 눌러 주세요.');
  if (await Notification.requestPermission() !== 'granted') return toast('알림 권한이 꺼져 있습니다');
  const reg = await navigator.serviceWorker.ready;
  const { data: key, error } = await sb.rpc('planner_vapid_public');
  if (error || !key) return toast('알림 열쇠를 받지 못했습니다');
  const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) });
  const j = sub.toJSON();
  const { error: e2 } = await sb.from('think_push_subs').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_id: S.user.id });
  toast(e2 ? '알림 등록에 실패했습니다' : '이 기기에서 알림을 켰습니다');
}
async function pushOff() {
  const reg = await navigator.serviceWorker?.getRegistration(), sub = reg && await reg.pushManager.getSubscription();
  if (sub) { if (sb) await sb.from('think_push_subs').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
  toast('이 기기의 알림을 껐습니다');
}
const sha = async t => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('tfm:' + t))), b => b.toString(16).padStart(2, '0')).join('');
async function toggleLock() {
  if (S.unlocked) { S.unlocked = false; return render(); }
  const s = settings();
  if (s.pin) { const p = prompt('잠금 영역 비밀번호'); if (p == null) return; if (await sha(p) !== s.pin) return toast('비밀번호가 다릅니다'); }
  S.unlocked = true; render(); toast('잠금 영역을 열었습니다. 한 번 더 누르면 닫힙니다.');
}
function toPlanner(id) {
  const n = node(id), title = prompt('할 일로 만들 문장', n.next || n.t); if (!title) return;
  const t = addTask({ title, due: ymd(), from: id });
  (n.todo ||= []).push({ id: t.id, title, at: Date.now() }); if ((n.st || 0) < 1) n.st = 1;
  put(n); openNode(id); toast('오늘 할 일에 넣었습니다', '할 일 보기', () => { S.after = () => go('todo'); closeAll(); });
}
function addPhoto(id, file) {
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    const k = Math.min(1, 900 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    put({ id: 'ph_' + id, kind: 'photo', img: c.toDataURL('image/jpeg', 0.72) }, true);
    const t = document.createElement('canvas'), tk = 200 / Math.min(img.width, img.height); t.width = t.height = 200;
    t.getContext('2d').drawImage(img, (200 - img.width * tk) / 2, (200 - img.height * tk) / 2, img.width * tk, img.height * tk);
    const n = node(id); n.ph = true; n.th = t.toDataURL('image/jpeg', 0.7);  put(n); openNode(id); URL.revokeObjectURL(url);
  };
  img.src = url;
}

// ── 할 일: 예전 플래너를 이리로 옮김 (업무 성격 6분류 · 시간 블록 · 핵심 3 · 하루 마감 · 구글 캘린더) ──
// 기록은 생각과 같은 표(think_items)에 kind = task · block · day 로 들어갑니다.
const CATS = [
  { n: '분류 전', h: '나중에 성격을 정할 일', dur: 30, c: '#8B95A1', g: '8' },
  { n: '119 긴급한 일', h: '오늘 반드시 처리', dur: 60, c: '#F04452', g: '11' },
  { n: '금방 할 수 있는 일', h: '30분 안에 끝낼 일', dur: 30, c: '#00A97F', g: '10' },
  { n: '오래 고민해야 하는 일', h: '집중 시간 확보', dur: 90, c: '#7C5CFA', g: '3' },
  { n: '협업이 필요한 일', h: '요청하고 함께 진행', dur: 60, c: '#0CA5C1', g: '9' },
  { n: '빠르게 시켜야 할 일', h: '아침에 먼저 넘기기', dur: 30, c: '#F59E0B', g: '6' },
  { n: '중요하게 해야 할 일', h: '긴급하진 않지만 핵심', dur: 60, c: '#3182F6', g: '7' },
];
const catOf = i => CATS[i] || CATS[0];
const QM = { think: ['생각', '지금 떠오른 생각을 한 줄로'], work: ['작품', '오징어 게임 드라마 봤음 ★4'], todo: ['할 일', '내일 3시 견적서 보내기 #영업 @김대리'], urgent: ['119', '지금 급한 일을 한 줄로'] };
function setQm(m) { S.qm = m; const b = $('#qMode'); if (!b) return; b.textContent = QM[m][0]; b.className = 'qm-' + m; $('#quickIn').placeholder = QM[m][1]; }
const id32 = (n = 14) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => '0123456789abcdefghijklmnopqrstuv'[b & 31]).join('');   // 구글 캘린더 일정 id로도 쓸 수 있는 글자만
const WD = '일월화수목금토';
const toDate = s => new Date(s + 'T12:00:00');
const addD = (d, n) => { const t = toDate(d); t.setDate(t.getDate() + n); return ymd(t); };
const dDiff = (a, b) => Math.round((toDate(a) - toDate(b)) / DAY);
const toMin = hm => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + (m || 0); };
const toHm = m => { m = Math.max(0, Math.min(1439, Math.round(m))); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const durText = m => m < 60 ? `${m}분` : m % 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m / 60}시간`;
const relDay = d => { const n = dDiff(d, ymd()); return n === 0 ? '오늘' : n === 1 ? '내일' : n === -1 ? '어제' : n === 2 ? '모레' : `${fmtDay(toDate(d).getTime())}(${WD[toDate(d).getDay()]})`; };

/* 한 줄 해석 — 예) "내일 3시 견적서 보내기 #영업 @김대리 30분"
   #태그  @담당  !1~!6 분류  오늘·내일·모레·금요일·다음주 월요일·11월 15일·11/15  3시·오후 3시 반·15:30·10시~12시  30분·1시간  "…까지" = 마감 */
function parseQuick(raw) {
  const out = { title: '', tags: [], who: '', cat: null, date: null, due: null, start: null, end: null, dur: null }, t = ymd();
  let s = ' ' + String(raw).replace(/\s+/g, ' ').trim() + ' ';
  s = s.replace(/(\d{1,2}:\d{2})\s?[-~]\s?(\d{1,2}:\d{2})/, '$1 ~ $2').replace(/\s?~\s?/g, ' ~ ');
  s = s.replace(/ #([^\s#@!]+)/g, (m, x) => { if (!out.tags.includes(x)) out.tags.push(x); return ' '; });
  s = s.replace(/ @([^\s#@!]+)/, (m, w) => { out.who = w; return ' '; });
  s = s.replace(/ !([0-6])(?= )/, (m, c) => { out.cat = Number(c); return ' '; });
  let dueOnly = false;
  const setDate = (d, until) => { if (!out.date) { out.date = d; dueOnly = !!until; } return ' '; };
  s = s.replace(/ (오늘|내일|모레|글피)(까지)?(?= )/, (m, w, u) => setDate(addD(t, { 오늘: 0, 내일: 1, 모레: 2, 글피: 3 }[w]), u));
  s = s.replace(/ (?:(이번 ?주|다음 ?주) ?)?([월화수목금토일])요일(까지|에)?(?= )/, (m, wk, d, u) => {
    const tg = WD.indexOf(d), dw = toDate(t).getDay();
    return setDate(wk ? addD(addD(t, -((dw + 6) % 7)), (wk.startsWith('다음') ? 7 : 0) + ((tg + 6) % 7)) : addD(t, (tg - dw + 7) % 7), u === '까지');
  });
  const md = (mo, da, u) => {
    mo = Number(mo); da = Number(da); if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    const y = toDate(t).getFullYear(); let d = `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
    if (dDiff(d, t) < -180) d = `${y + 1}-${d.slice(5)}`;
    return setDate(d, u === '까지');
  };
  s = s.replace(/ (\d{1,2})월 ?(\d{1,2})일(까지|에)?(?= )/, (m, a, b, u) => md(a, b, u) ?? m);
  s = s.replace(/ (\d{1,2})\/(\d{1,2})(까지)?(?= )/, (m, a, b, u) => md(a, b, u) ?? m);
  const times = [];
  const pushTime = (hh, mm, ap) => {
    hh = Number(hh); mm = Number(mm || 0); if (hh > 24 || mm > 59) return false;
    if (/오후|저녁|밤/.test(ap || '')) { if (hh < 12) hh += 12; } else if (/오전|아침|새벽/.test(ap || '')) { if (hh === 12) hh = 0; } else if (ap !== 'x' && hh >= 1 && hh <= 6) hh += 12;   // "3시" → 오후 3시
    times.push(Math.min(hh * 60 + mm, 1439)); return true;
  };
  s = s.replace(/ (\d{1,2}):(\d{2})(?= )/g, (m, a, b) => (times.length < 2 && pushTime(a, b, 'x')) ? ' ' : m);
  s = s.replace(/ (?:(오전|오후|아침|저녁|밤|새벽) ?)?(\d{1,2})시 ?(반|(\d{1,2})분)?(에|부터|까지)?(?= )/g, (m, ap, hh, half, mm) => (times.length < 2 && pushTime(hh, half === '반' ? 30 : mm, ap)) ? ' ' : m);
  s = s.replace(/ ~ /g, ' ');
  s = s.replace(/ (\d{1,2})시간(?: ?(\d{1,2})분)?(?: ?동안)?(?= )/, (m, a, b) => { out.dur = Number(a) * 60 + Number(b || 0); return ' '; });
  if (out.dur == null) s = s.replace(/ (\d{1,3})분(?: ?동안)?(?= )/, (m, a) => { out.dur = Number(a); return ' '; });
  if (times.length) { out.start = toHm(times[0]); if (times[1] != null) { let e = times[1]; if (e <= times[0] && e + 720 <= 1439) e += 720; if (e > times[0]) out.end = toHm(e); } }
  if (out.date && (dueOnly || !out.start)) { out.due = out.date; out.date = null; }
  if (out.start && !out.date) out.date = t;
  out.title = s.replace(/\s+/g, ' ').trim() || String(raw).trim();
  return out;
}

const tasks = () => all('task');
const isOpenT = t => (t.st || 'open') === 'open';
const blocksOn = d => all('block').filter(b => b.date === d).sort((a, b) => a.start < b.start ? -1 : 1);
const dayRec = d => S.items.get('day:' + d) || { id: 'day:' + d, kind: 'day', date: d, top: [], note: '' };
const addTask = f => put({ id: 't' + id32(), kind: 'task', title: String(f.title).slice(0, 300), cat: f.cat ?? 0, tags: f.tags || [], who: f.who || '', due: f.due || '', note: f.note || '', st: 'open', at: Date.now(), doneAt: null, from: f.from || '' }, true);
function addBlock(f) {
  const b = put({ id: 'b' + id32(), kind: 'block', date: f.date, start: f.start, end: f.end || toHm(toMin(f.start) + (f.dur || catOf(f.cat).dur)), title: f.title, cat: f.cat ?? 0, taskId: f.taskId || '', done: false }, true);
  gSoon(); return b;
}
// 그날 비어 있는 첫 시간 (시간 블록과 구글 일정을 피해서)
function freeSlot(d, dur) {
  const busy = [...blocksOn(d), ...(GC.ev.get(d) || []).filter(e => !e.allDay)].map(b => [toMin(b.start), toMin(b.end)]).sort((a, b) => a[0] - b[0]);
  let t = d === ymd() ? Math.max(9 * 60, Math.ceil((nowMin() + 5) / 10) * 10) : 9 * 60;
  for (const [s, e] of busy) { if (t + dur <= s) break; if (e > t) t = e; }
  return toHm(Math.min(t, 1439 - dur));
}
function addTodo(text, urgent) {
  text = text.trim(); if (!text) return;
  bump(true);
  const p = parseQuick(text), cat = urgent ? 1 : p.cat ?? 0;
  const t = addTask({ title: p.title, cat, tags: p.tags, who: p.who, due: p.due || (p.start ? '' : ymd()) });
  if (p.start) addBlock({ date: p.date, start: p.start, end: p.end, dur: p.dur, title: t.title, cat, taskId: t.id });
  render();
  toast(`${urgent ? '119 긴급한 일' : '할 일'}로 넣었습니다${p.start ? `. ${relDay(p.date)} ${p.start}` : p.due && p.due !== ymd() ? `. ${relDay(p.due)}까지` : ''}`, '열기', () => openTask(t.id));
}
function setDone(t, done) {
  t.st = done ? 'done' : 'open'; t.doneAt = done ? Date.now() : null; put(t, true);
  all('block').filter(b => b.taskId === t.id).forEach(b => { b.done = done; put(b, true); });
  gSoon(); render();
  if (done) toast('끝냈습니다', '되돌리기', () => setDone(t, false));
}
// 그날 볼 할 일: 119 → 핵심 → 시간 잡힌 일 → 그날까지인 일, 그리고 그날 끝낸 일
function dayList(d) {
  const top = dayRec(d).top, hasB = new Set(blocksOn(d).map(b => b.taskId));
  const rank = t => t.cat === 1 ? 0 : top.includes(t.id) ? 1 : hasB.has(t.id) ? 2 : t.due && t.due <= d ? 3 : 9;
  return tasks().filter(t => (isOpenT(t) && rank(t) < 9) || (t.st === 'done' && t.doneAt && ymd(new Date(t.doneAt)) === d))
    .sort((a, b) => (b.st !== 'done') - (a.st !== 'done') || rank(a) - rank(b) || (a.at || 0) - (b.at || 0));
}
function tRow(t, d = S.td || ymd()) {
  const c = catOf(t.cat), bl = all('block').find(b => b.taskId === t.id && b.date === d), late = t.due && t.due < d && isOpenT(t), done = t.st === 'done';
  const meta = [t.cat ? `<span style="color:${c.c};font-weight:700">${t.cat === 1 ? '119 긴급' : esc(c.n)}</span>` : '', dayRec(d).top.includes(t.id) ? '<mark>핵심</mark>' : '',
    bl ? `<span>${bl.start}~${bl.end}</span>` : '', t.due && t.due !== d ? `<span${late ? ' style="color:var(--red)"' : ''}>${relDay(t.due)}${late ? ' 마감 지남' : '까지'}</span>` : '',
    t.st === 'wait' ? '<span>답 기다리는 중</span>' : '', t.who ? `<span>@${esc(t.who)}</span>` : '', ...(t.tags || []).map(x => `<span>#${esc(x)}</span>`), S.depth >= 3 && t.note ? `<span>${esc(t.note)}</span>` : ''].join('');
  return `<div class="todo${done ? ' done' : ''}"><button class="ck${done ? ' on' : ''}" data-tdone="${t.id}" aria-label="${done ? '끝낸 일 되돌리기' : '끝냄으로 표시'}">${done ? '✓' : ''}</button><button class="rb" data-tk="${t.id}"><b>${esc(t.title)}</b>${meta ? `<span class="meta">${meta}</span>` : ''}</button>${isOpenT(t) && !bl ? `<button class="tbtn" data-tsched="${t.id}">시간</button>` : ''}</div>`;
}
const bRow = b => { const n = b.date === ymd() && toMin(b.start) <= nowMin() && nowMin() < toMin(b.end);
  return `<div class="tlr${b.done ? ' done' : ''}${n ? ' now' : ''}"><span class="tm">${b.start}<small>${b.end}</small></span><i class="tbar" style="background:${catOf(b.cat).c}"></i><button class="rb" data-bk="${b.id}"><b>${esc(b.title)}</b><span class="meta"><span>${durText(toMin(b.end) - toMin(b.start))}</span>${n ? '<mark>지금</mark>' : ''}</span></button><button class="ck${b.done ? ' on' : ''}" data-bdone="${b.id}" aria-label="끝냄 표시">${b.done ? '✓' : ''}</button></div>`; };
const eRow = e => `<div class="tlr ev"><span class="tm">${e.allDay ? '종일' : `${e.start}<small>${e.end}</small>`}</span><i class="tbar"></i><a class="rb" href="${esc(e.link || '#')}" target="_blank" rel="noopener"><b>${esc(e.title)}</b><span class="meta"><span>구글 캘린더</span></span></a></div>`;

function viewTodo() {
  const m = S.tmode || 'day';
  return `<div class="seg sub">${[['day', '하루'], ['all', '전체']].map(([k, l]) => `<button data-tmode="${k}" class="${m === k ? 'on' : ''}">${l}</button>`).join('')}</div>` + (m === 'all' ? todoAll() : todoDay());
}
function todoDay() {
  const d = S.td || ymd(), day = dayRec(d), bl = blocksOn(d), ev = GC.ev.get(d) || [], isT = d === ymd(), list = dayList(d);
  if (gOn()) gEvents(d);
  const tl = [...bl.map(b => [b.start, bRow(b)]), ...ev.filter(e => !e.allDay).map(e => [e.start, eRow(e)])].sort((a, b) => a[0] < b[0] ? -1 : 1);
  const top = day.top.map(id => S.items.get(id)).filter(t => t && !t.deleted), left = bl.filter(b => !b.done);
  return `<section class="card"><div class="hd" style="align-items:center"><button class="ib" data-tday="-1" aria-label="전날">‹</button><h2 style="margin:0;text-align:center">${isT ? '오늘, ' : ''}${fmtDay(toDate(d).getTime())} ${WD[toDate(d).getDay()]}요일${day.closedAt ? ' <span class="chip need">마감</span>' : ''}</h2><button class="ib" data-tday="1" aria-label="다음날">›</button></div>${isT ? '' : '<div style="text-align:center;margin-top:6px"><button class="lnk" data-tday="0">오늘로 돌아가기</button></div>'}</section>
<section class="card"><div class="hd"><h2>핵심 3가지</h2><span class="dim">${top.filter(t => t.st === 'done').length}/3 끝냄</span></div>${[0, 1, 2].map(i => top[i] ? tRow(top[i], d) : `<button class="slot" data-top="${i}">핵심 ${i + 1} 고르기</button>`).join('')}</section>
<section class="card"><div class="hd"><h2>시간표</h2><button class="lnk" data-act="blockNew">시간 블록 추가</button></div>${ev.filter(e => e.allDay).map(eRow).join('')}${tl.map(x => x[1]).join('') || '<p class="dim">시간을 붙인 일이 없습니다. 할 일 옆 \'시간\'을 누르면 비어 있는 시간에 들어갑니다.</p>'}</section>
<section class="card"><div class="hd"><h2>${isT ? '오늘' : '이날'} 할 일 ${list.filter(isOpenT).length}개</h2><button class="lnk" data-tmode="all">전체</button></div>${list.map(t => tRow(t, d)).join('') || '<p class="dim">아래 칸 왼쪽 단추를 \'할 일\'로 바꿔 적어 보세요. "내일 3시 견적서 #영업 @김대리"처럼 적으면 날짜·시간·태그·담당이 붙습니다.</p>'}</section>
<section class="card"><h2>하루 마감</h2>${day.closedAt
    ? `${day.note ? `<p style="margin:0 0 6px;font-size:17px;font-weight:600">${esc(day.note)}</p>` : ''}<p class="dim small">${new Date(day.closedAt).toTimeString().slice(0, 5)}에 도장을 찍었습니다</p><div class="btns"><button class="btn" data-act="reopenDay">도장 지우기</button></div>`
    : `<p class="dim">${left.length ? `못 끝낸 시간 블록이 ${left.length}개 있습니다. 내일 같은 시간으로 넘길 수 있습니다.` : '시간 블록을 모두 끝냈습니다.'}</p><label class="f">하루를 한 줄로<input id="dayNote" value="${esc(day.note || '')}" placeholder="오늘 어땠나요"></label><div class="btns">${left.length ? '<button class="btn" data-act="carry">못 끝낸 블록 내일로</button>' : ''}<button class="btn pri" data-act="closeDay">도장 찍기</button></div>`}</section>`;
}
function todoAll() {
  const ts = tasks(), open = ts.filter(isOpenT), wait = ts.filter(t => t.st === 'wait'), done = ts.filter(t => t.st === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  if (!ts.length) return '<section class="card"><h2>아직 할 일이 없습니다</h2><p class="dim">아래 칸 왼쪽 단추를 \'할 일\'이나 \'119\'로 바꿔 한 줄로 적어 보세요. !1~!6을 붙이면 성격이 정해집니다 (!1 긴급, !2 금방, !3 오래 고민, !4 협업, !5 시킬 일, !6 중요).</p></section>';
  return [1, 6, 3, 4, 5, 2, 0].map(i => { const l = open.filter(t => (t.cat || 0) === i).sort((a, b) => (a.due || '9') < (b.due || '9') ? -1 : 1);
    return l.length ? `<section class="card"><div class="hd"><h2 style="color:${CATS[i].c}">${CATS[i].n}</h2><span class="dim">${l.length}개</span></div><p class="dim small" style="margin:-8px 0 4px">${CATS[i].h}</p>${l.map(t => tRow(t)).join('')}</section>` : ''; }).join('')
    + (wait.length ? `<section class="card"><h2>넘기고 답을 기다리는 일</h2>${wait.map(t => tRow(t)).join('')}</section>` : '')
    + `<section class="card"><div class="hd"><h2>끝낸 일 ${done.length}개</h2>${done.length ? `<button class="lnk" data-act="showDone">${S.showDone ? '접기' : '보기'}</button>` : ''}</div>${S.showDone ? done.slice(0, 60).map(t => tRow(t)).join('') : ''}</section>`;
}
// 홈에 보이는 오늘 할 일 요약
function todoCard() {
  const d = ymd(), list = dayList(d), bl = blocksOn(d).filter(b => !b.taskId), left = list.filter(isOpenT).length + bl.filter(b => !b.done).length;
  if (!list.length && !bl.length && !tasks().length) return '';
  return `<section class="card"><div class="hd"><h2>오늘 할 일 ${left ? left + '개' : ''}</h2><button class="lnk" data-go="todo">할 일 탭</button></div>
${list.slice(0, 7).map(t => tRow(t, d)).join('')}${bl.map(bRow).join('')}${list.length > 7 ? `<p class="dim small">${list.length - 7}개 더 있습니다</p>` : ''}${list.length + bl.length ? '' : '<p class="dim">오늘 잡힌 일이 없습니다.</p>'}</section>`;
}

// ── 할 일 창들 ──
const openTask = id => { if (S.items.get(id)) show('task:' + id, () => drawTask(id)); };
function drawTask(id) {
  const t = S.items.get(id); if (!t || t.deleted) return history.back();
  S.selT = id; const d = S.td || ymd(), top = dayRec(d).top.includes(id), bl = all('block').filter(b => b.taskId === id).sort((a, b) => (a.date + a.start) < (b.date + b.start) ? -1 : 1);
  sheet(`<div class="grab"></div><h2>할 일</h2>
<label class="f">무엇을<input id="t_title" value="${esc(t.title)}"></label>
<p class="f">성격</p><div class="catp">${CATS.map((c, i) => `<button data-tcat="${i}" class="${(t.cat || 0) === i ? 'on' : ''}" style="--c:${c.c}">${i === 1 ? '119 긴급' : esc(c.n)}</button>`).join('')}</div>
<div class="line"><label class="f">언제까지<input id="t_due" type="date" value="${t.due || ''}"></label><label class="f">담당<input id="t_who" value="${esc(t.who || '')}" placeholder="시킬 사람"></label></div>
<label class="f">태그 (띄어 써서 여러 개)<input id="t_tags" value="${esc((t.tags || []).join(' '))}"></label>
<label class="f">메모<textarea id="t_note">${esc(t.note || '')}</textarea></label>
${bl.length ? `<p class="f">붙인 시간</p>${bl.map(b => `<button class="lk" style="width:100%" data-bk="${b.id}">${relDay(b.date)} ${b.start}~${b.end}${b.done ? ' (끝냄)' : ''}</button>`).join('')}` : ''}
<div class="btns"><button class="btn pri" data-act="tSave">저장</button><button class="btn" data-tsched="${id}">시간 붙이기</button><button class="btn" data-act="tTop">${top ? '핵심에서 빼기' : '핵심으로'}</button><button class="btn" data-act="tWait">${t.st === 'wait' ? '다시 할 일로' : '넘겼어요, 기다리는 중'}</button>${t.from && node(t.from) ? `<button class="btn" data-node="${t.from}">나온 생각 보기</button>` : ''}<button class="btn red" data-act="tDel">지우기</button></div>`);
}
const openSched = (tid, bid) => show('sched', () => {
  const t = tid && S.items.get(tid), b = bid && S.items.get(bid), d = b?.date || S.td || ymd(), dur = b ? toMin(b.end) - toMin(b.start) : catOf(t?.cat).dur, st = b?.start || freeSlot(d, dur);
  S.sch = { tid, bid };
  sheet(`<div class="grab"></div><h2>${b ? '시간 블록' : t ? '시간 붙이기' : '시간 블록 추가'}</h2>${t ? `<p class="dim">${esc(t.title)}</p>` : `<label class="f">무엇을<input id="s_title" value="${esc(b?.title || '')}" placeholder="예: 점심, 운동, 회의"></label>`}
<div class="line"><label class="f">날짜<input id="s_date" type="date" value="${d}"></label><label class="f">시작<input id="s_start" type="time" step="300" value="${st}"></label></div>
<label class="f">길이<select id="s_dur">${[15, 30, 45, 60, 90, 120, 180, 240].map(m => `<option value="${m}" ${m === dur ? 'selected' : ''}>${durText(m)}</option>`).join('')}${[15, 30, 45, 60, 90, 120, 180, 240].includes(dur) ? '' : `<option value="${dur}" selected>${durText(dur)}</option>`}</select></label>
<p class="dim small" style="margin-top:8px">비어 있는 첫 시간을 미리 넣어 두었습니다.</p>
<div class="btns"><button class="btn pri" data-act="schSave">${b ? '저장' : '넣기'}</button>${b ? `<button class="btn" data-bdone="${b.id}">${b.done ? '다시 하기' : '끝냄'}</button><button class="btn red" data-act="bDel">지우기</button>` : ''}</div>`);
});
const openTopPick = i => show('top', () => {
  const d = S.td || ymd(), top = dayRec(d).top, l = tasks().filter(t => isOpenT(t) && !top.includes(t.id)).sort((a, b) => (a.cat === 1 ? -1 : 0) - (b.cat === 1 ? -1 : 0) || (a.due || '9') < (b.due || '9') ? -1 : 1);
  sheet(`<div class="grab"></div><h2>핵심 ${i + 1} 고르기</h2><p class="dim">오늘 꼭 끝낼 일 하나를 고릅니다.</p>${l.map(t => `<button class="item" data-picktop="${t.id}"><span class="rb"><b>${esc(t.title)}</b><span class="meta"><span>${esc(catOf(t.cat).n)}</span>${t.due ? `<span>${relDay(t.due)}까지</span>` : ''}</span></span></button>`).join('') || '<p class="empty">고를 할 일이 없습니다. 먼저 할 일을 적어 주세요.</p>'}`);
});

// ── 작품: 영화·드라마·미드·애니·책·웹툰 — 보는 중·다 봄·볼 것, 정보·히스토리·배경·파생·느낀 거 ──
// 기록: kind 'work' = { title, orig, type, st(want·doing·done·drop), prog, rate(1~5), start, end, year, creator, cast, genre, country, len,
//   syn(줄거리), hist(히스토리: 만들어진 과정), bg(배경: 시대·세계관·실제 사건), der[{t, rel}](파생·관련), sim[](비슷한 작품), img, wiki, notes[{at, text, nid}], aiAt, aiBy }
const WTYPES = ['영화', '드라마', '미드', '애니', '책', '웹툰', '다큐', '기타'];
const WST = { doing: '보는 중', done: '다 봄', want: '볼 것', drop: '그만 봄' };
const works = () => all('work');
const stars = (r, id) => `<span class="stars">${[1, 2, 3, 4, 5].map(i => id ? `<button data-wrate="${id}:${i}" aria-label="${i}점" class="${i <= (r || 0) ? 'on' : ''}">★</button>` : `<i class="${i <= (r || 0) ? 'on' : ''}">★</i>`).join('')}</span>`;
const poster = (w, cls = 'pst') => w.img ? `<img class="${cls}" src="${esc(w.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="${cls} tile" style="background:${pal(w.type || '기타')[0]};color:${pal(w.type || '기타')[1]}">${esc(w.title.slice(0, 12))}</span>`;
// 한 줄로 적기: "오징어 게임 시즌2 드라마 봤음 ★4", "듄 책 볼 것", "삼체 보는중 3화"
function addWork(text) {
  text = text.trim(); if (!text) return;
  bump(true);
  let s = ' ' + text + ' ', st = 'doing', type = '', rate = 0, prog = '';
  s = s.replace(/ (봤음|봤다|다 ?봄|완독|다 ?읽음|끝)(?= )/, () => { st = 'done'; return ' '; })
       .replace(/ (볼 ?것|볼 ?거|보고 ?싶음|찜|읽을 ?것)(?= )/, () => { st = 'want'; return ' '; })
       .replace(/ (보는 ?중|읽는 ?중|보는중)(?= )/, () => { st = 'doing'; return ' '; })
       .replace(/ (그만 ?봄|하차)(?= )/, () => { st = 'drop'; return ' '; })
       .replace(/ (?:★|별)\s?([1-5])(?= )/, (m, r) => { rate = +r; return ' '; })
       .replace(/ ([1-5])점(?= )/, (m, r) => { rate = +r; return ' '; })
       .replace(/ ((?:시즌|S)\s?\d+\s?(?:[E화]\s?\d+)?|\d+\s?(?:화|회|쪽|권|장)(?:까지)?)(?= )/i, (m, p) => { prog = p; return ' '; });
  for (const t of WTYPES) { const re = new RegExp(` ${t}(?= )`); if (re.test(s)) { type = t; s = s.replace(re, ' '); break; } }
  const title = s.replace(/\s+/g, ' ').trim() || text;
  const old = works().find(w => w.title.replace(/\s/g, '') === title.replace(/\s/g, ''));
  if (old) { Object.assign(old, { st, ...(rate ? { rate } : {}), ...(prog ? { prog } : {}), ...(st === 'done' && !old.end ? { end: ymd() } : {}) }); put(old, true); render(); return toast(`'${old.title}'을 ${WST[st]}으로 바꿨습니다`, '열기', () => openWork(old.id)); }
  const w = put({ id: 'w' + id32(), kind: 'work', title, type: type || '기타', st, rate, prog, start: st === 'want' ? '' : ymd(), end: st === 'done' ? ymd() : '', notes: [], at: Date.now() }, true);
  render();
  const go_ = () => openWork(w.id);
  toast(`'${title}'을 ${WST[st]}에 넣었습니다`, settings().gkey || settings().xkey || settings().ckey ? 'AI로 정보 채우기' : '열기', () => { go_(); if (settings().gkey || settings().xkey || settings().ckey) setTimeout(() => workAI(w.id), 300); });
}
function viewWorks() {
  const ws = works(), m = S.wmode || 'doing', yr = String(new Date().getFullYear());
  const list = ws.filter(w => m === 'all' || w.st === m || (m === 'done' && w.st === 'drop')).sort((a, b) => (b.end || b.start || '').localeCompare(a.end || a.start || '') || (b.at || 0) - (a.at || 0));
  const doneY = ws.filter(w => w.st === 'done' && (w.end || '').startsWith(yr)), byType = new Map(); doneY.forEach(w => byType.set(w.type, (byType.get(w.type) || 0) + 1));
  return `<div class="seg sub">${[['doing', '보는 중'], ['done', '다 봄'], ['want', '볼 것'], ['all', '전체']].map(([k, l]) => `<button data-wmode="${k}" class="${m === k ? 'on' : ''}">${l} ${ws.filter(w => k === 'all' || w.st === k || (k === 'done' && w.st === 'drop')).length}</button>`).join('')}</div>
${ws.length ? `<section class="card"><h2 class="big">올해 ${doneY.length}편을 다 봤습니다</h2><p class="dim">${[...byType].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(' · ') || '아직 다 본 작품이 없습니다'}${ws.some(w => w.rate) ? ` · 평균 별 ${(ws.filter(w => w.rate).reduce((s, w) => s + w.rate, 0) / ws.filter(w => w.rate).length).toFixed(1)}` : ''}</p></section>` : ''}
<section class="card">${list.length ? `<div class="wgrid">${list.map(w => `<button class="wcard" data-wk="${w.id}">${poster(w)}<b>${esc(w.title)}</b><span class="meta"><span>${esc(w.type || '')}${w.year ? ' · ' + esc(w.year) : ''}</span>${w.prog && w.st === 'doing' ? `<span>${esc(w.prog)}</span>` : ''}${w.st === 'drop' ? '<span>그만 봄</span>' : ''}</span>${w.rate ? stars(w.rate) : ''}</button>`).join('')}</div>`
    : `<h2>${m === 'want' ? '볼 작품이 없습니다' : m === 'done' ? '다 본 작품이 없습니다' : '보고 있는 작품이 없습니다'}</h2><p class="dim">아래 칸 왼쪽 단추를 '작품'으로 바꿔 적어 보세요. 예: "오징어 게임 드라마 봤음 ★4", "삼체 책 읽는중 120쪽", "듄 영화 볼 것". 넣은 뒤 'AI로 정보 채우기'를 누르면 작품 정보·히스토리·배경·파생 작품이 채워집니다.</p>`}</section>`;
}
// 홈: 지금 보는 작품
function worksStrip() {
  const l = works().filter(w => w.st === 'doing'); if (!l.length) return '';
  return `<section class="card"><div class="hd"><h2>보고 있는 작품</h2><button class="lnk" data-go="works">전체</button></div><div class="wrow">${l.map(w => `<button class="wcard" data-wk="${w.id}">${poster(w)}<b>${esc(w.title)}</b>${w.prog ? `<span class="meta"><span>${esc(w.prog)}</span></span>` : ''}</button>`).join('')}</div></section>`;
}
const openWork = id => { if (S.items.get(id)) show('work:' + id, () => drawWork(id)); };
function drawWork(id) {
  const w = S.items.get(id); if (!w || w.deleted) return history.back();
  S.selW = id;
  const info = [['원제', w.orig], ['나온 해', w.year], ['만든 사람', w.creator], ['출연·인물', w.cast], ['장르', w.genre], ['나라', w.country], ['분량', w.len]].filter(x => x[1]);
  const sec = (t, v) => v ? `<h3>${t}</h3><p class="wtxt">${esc(v)}</p>` : '';
  sheet(`<div class="grab"></div><div class="whead">${poster(w, 'pst big')}<div><div class="chips" style="margin-top:0"><span class="chip">${esc(w.type || '기타')}</span><span class="chip need">${WST[w.st] || ''}</span></div>
<p class="ttl" style="margin-top:8px">${esc(w.title)}</p>${stars(w.rate, id)}
<div class="wst">${Object.entries(WST).map(([k, l]) => `<button data-wst="${k}" class="${w.st === k ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
<div class="line"><label class="f">어디까지<input id="w_prog" value="${esc(w.prog || '')}" placeholder="시즌2 5화, 120쪽" data-wfield="prog"></label><label class="f">시작<input id="w_start" type="date" value="${w.start || ''}" data-wfield="start"></label><label class="f">끝<input id="w_end" type="date" value="${w.end || ''}" data-wfield="end"></label></div>
<section class="evalbox"><div class="hd"><h3>느낀 거 ${(w.notes || []).length}</h3></div>
${(w.notes || []).slice().reverse().map((n, i) => `<div class="wnote"><p>${esc(n.text)}</p><span class="meta"><span>${fmtDay(n.at)}${n.prog ? ' · ' + esc(n.prog) : ''}</span>${n.nid && node(n.nid) ? `<button class="lnk" data-node="${n.nid}">생각 지도에서 보기</button>` : `<button class="lnk" data-wthink="${(w.notes.length - 1 - i)}">생각 지도에도 넣기</button>`}</span></div>`).join('')}
<textarea class="in" id="w_note" rows="3" placeholder="지금 느낀 것, 떠오른 생각, 좋았던 장면"></textarea><div class="btns" style="margin-top:8px"><button class="btn pri" data-act="wNote">남기기</button></div></section>
${w.aiAt ? '' : `<div class="btns"><button class="btn pri" data-act="wAI">AI로 작품 정보·히스토리·배경·파생 채우기</button></div>`}
${info.length ? `<h3>작품 정보</h3><div class="winfo">${info.map(([k, v]) => `<span>${k}</span><b>${esc(v)}</b>`).join('')}</div>` : ''}
${sec('줄거리', w.syn)}${sec('히스토리 · 만들어진 과정', w.hist)}${sec('배경 · 시대와 세계', w.bg)}
${(w.der || []).length ? `<h3>파생 · 이어진 작품</h3>${w.der.map(d => `<div class="lk"><span style="flex:1"><b>${esc(d.t)}</b><small>${esc(d.rel || '')}</small></span><button class="chip" data-wwant="${esc(d.t)}">볼 것에 넣기</button></div>`).join('')}` : ''}
${(w.sim || []).length ? `<h3>비슷한 작품</h3><div class="chips">${w.sim.map(t => `<button class="chip" data-wwant="${esc(t)}">${esc(t)} +</button>`).join('')}</div>` : ''}
${w.aiAt ? `<p class="dim small" style="margin-top:14px">${esc(w.aiBy || 'AI')}가 ${fmtDay(w.aiAt)}에 채운 정보입니다. 틀린 곳이 있을 수 있습니다.${w.wiki ? ` <a href="${esc(w.wiki)}" target="_blank" rel="noopener">위키백과에서 확인</a>` : ''}</p>` : ''}
<h3>이 작품 다루기</h3><div class="btns" style="margin-top:0">${w.aiAt ? '<button class="btn" data-act="wAI">AI로 다시 채우기</button>' : ''}<button class="btn" data-act="wEdit">고치기</button><button class="btn" data-act="wImg">포스터·그림 찾기</button><button class="btn red" data-act="wDel">지우기</button></div>`);
}
const editWork = id => show('wedit', () => {
  const w = S.items.get(id), F = [['title', '제목'], ['orig', '원제'], ['year', '나온 해'], ['creator', '만든 사람'], ['cast', '출연·인물'], ['genre', '장르'], ['country', '나라'], ['len', '분량']];
  sheet(`<div class="grab"></div><h2>작품 고치기</h2><label class="f">종류<select id="we_type">${WTYPES.map(t => `<option ${t === w.type ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
${F.map(([k, l]) => `<label class="f">${l}<input id="we_${k}" value="${esc(w[k] || '')}"></label>`).join('')}
${[['syn', '줄거리'], ['hist', '히스토리 · 만들어진 과정'], ['bg', '배경 · 시대와 세계']].map(([k, l]) => `<label class="f">${l}<textarea id="we_${k}">${esc(w[k] || '')}</textarea></label>`).join('')}
<label class="f">파생 · 이어진 작품 (한 줄에 하나, "작품 - 관계")<textarea id="we_der">${esc((w.der || []).map(d => d.t + (d.rel ? ' - ' + d.rel : '')).join('\n'))}</textarea></label>
<div class="btns"><button class="btn pri" data-act="wSave">저장</button><button class="btn" data-act="back">그만두기</button></div>`);
});
async function wikiImg(q) {
  for (const lang of ['ko', 'en']) {
    try {
      const j = await (await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=pageimages|info&inprop=url&piprop=thumbnail&pithumbsize=500&pilicense=any&titles=${encodeURIComponent(q)}`)).json();
      const p = Object.values(j.query?.pages || {})[0];
      if (p && !p.missing && p.thumbnail) return { img: p.thumbnail.source, wiki: p.fullurl };
      if (p && !p.missing && p.fullurl) return { wiki: p.fullurl };
    } catch { /* 다음 언어 */ }
  }
  return {};
}
async function workAI(id) {
  const w = S.items.get(id); if (!w) return;
  const r = await busy('작품 정보를 찾는 중입니다', () => gemT('work', `아래 작품에 대해 아는 것을 JSON 하나로만 답하라. 한국어. 확실하지 않은 칸은 빈 문자열로 두고 지어내지 말 것.
형식: {"title":"한국어 정식 제목","orig":"원제","type":"${WTYPES.join('|')} 중 하나","year":"나온 해","creator":"감독·작가·원작자","cast":"주요 출연·인물 3~5명","genre":"장르","country":"나라","len":"러닝타임·회차·쪽수",
"syn":"줄거리 3~4문장(결말 누설 없이)","hist":"히스토리: 기획·제작·출간 과정, 흥행·반응, 상과 논란 등 3~5문장","bg":"배경: 시대·장소·세계관·바탕이 된 실제 사건이나 사상 3~4문장",
"der":[{"t":"원작·속편·프리퀄·스핀오프·리메이크·각색 작품 제목","rel":"관계(예: 원작 소설, 시즌2, 2013 리메이크)"}],"sim":["비슷한 결의 작품 3~5개"],"wiki":"위키백과 문서 제목(원제 또는 영어 제목)"}

[작품] ${w.title}${w.type && w.type !== '기타' ? ' (' + w.type + ')' : ''}${w.year ? ' ' + w.year : ''}`), 'work:' + id);
  if (!r) return;
  const pick = k => typeof r[k] === 'string' ? r[k].trim() : '';
  for (const k of ['orig', 'year', 'creator', 'cast', 'genre', 'country', 'len', 'syn', 'hist', 'bg']) if (pick(k)) w[k] = pick(k);
  if (WTYPES.includes(r.type) && (!w.type || w.type === '기타')) w.type = r.type;
  if (Array.isArray(r.der)) w.der = r.der.filter(d => d && d.t).slice(0, 10).map(d => ({ t: String(d.t), rel: String(d.rel || '') }));
  if (Array.isArray(r.sim)) w.sim = r.sim.map(String).slice(0, 6);
  w.aiAt = Date.now(); w.aiBy = r._by;
  if (!w.img || !w.wiki) { const x = await wikiImg(pick('wiki') || w.orig || w.title); if (!w.img && x.img) w.img = x.img; if (x.wiki) w.wiki = x.wiki; }
  put(w, true); refreshW(id);
  done(`${r._by}가 '${w.title}' 정보를 채웠습니다`, () => openWork(id));
}
const refreshW = id => { if (SH.length && SH[SH.length - 1].key === 'work:' + id) SH[SH.length - 1](); else render(); };
const openWImg = id => show('img', () => {
  const w = S.items.get(id);
  sheet(`<div class="grab"></div><h2>포스터·그림 찾기</h2><p class="dim">위키백과 대표 그림을 먼저 찾고, 없으면 위키미디어 공용에서 찾습니다.</p>
<form id="imgF" class="line" style="margin-top:12px"><input class="in" id="imgQ" value="${esc(w.orig || w.title)}" style="flex:1;margin:0"><button class="btn pri">찾기</button></form><div class="grid" id="imgR"></div>
<div class="btns"><label class="btn">내 사진 올리기<input type="file" accept="image/*" id="wPhoto" hidden></label></div>`);
  const run = async () => {
    $('#imgR').innerHTML = '<p class="empty">찾는 중입니다.</p>';
    const q = $('#imgQ').value.trim(), x = await wikiImg(q); let r = [];
    try { r = await commons(q, 12); } catch { /* 없음 */ }
    const all_ = [...(x.img ? [{ th: x.img, page: x.wiki }] : []), ...r];
    if ($('#imgR')) $('#imgR').innerHTML = all_.map(i => `<button data-wimg="${esc(i.th)}"><img src="${esc(i.th)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`).join('') || '<p class="empty">찾은 그림이 없습니다. 원제나 영어 제목으로 찾아 보세요.</p>';
  };
  $('#imgF').onsubmit = e => { e.preventDefault(); run(); }; run();
});
function workPhoto(id, file) {
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => { const k = Math.min(1, 500 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); const w = S.items.get(id); w.img = c.toDataURL('image/jpeg', 0.75); put(w, true); URL.revokeObjectURL(url); history.back(); };
  img.src = url;
}

// ── 구글 캘린더 (시간 블록을 올리고, 캘린더의 다른 일정을 시간표에 함께 보여 줌) ──
const GCAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const GC = { ev: new Map(), loading: new Set(), state: ls.get('tfm:gcal') ? 'on' : 'off' };
const gOn = () => GC.state === 'on';
async function gToken() {
  let c; try { c = JSON.parse(ls.get('tfm:gtok') || 'null'); } catch { /* 없음 */ }
  if (c && c.exp > Date.now() + 30e3) return c.t;
  if (!sb || !CFG.fn) return null;
  try {
    const { data } = await sb.auth.getSession();
    const r = await (await fetch(CFG.fn, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CFG.key, Authorization: 'Bearer ' + data.session.access_token }, body: JSON.stringify({ op: 'gtoken' }) })).json();
    if (r.access_token) { ls.set('tfm:gtok', JSON.stringify({ t: r.access_token, exp: Date.now() + ((+r.expires_in || 3600) - 120) * 1000 })); return r.access_token; }
    if (/reauth|not_connected|no_secret/.test(r.error || '')) { GC.state = 'expired'; GC.why = r.error; }
  } catch { /* 연결 안 됨 */ }
  return null;
}
async function gfetch(url, opt = {}, retry = true) {
  const t = await gToken(); if (!t) throw new Error('notoken');
  const res = await fetch(url, { ...opt, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' } });
  if (res.status === 401 && retry) { ls.set('tfm:gtok', ''); return gfetch(url, opt, false); }
  return res;
}
async function gEvents(d) {
  if (!gOn() || GC.loading.has(d)) return;
  GC.loading.add(d); setTimeout(() => GC.loading.delete(d), 120000);
  try {
    const from = new Date(d + 'T00:00:00'), to = new Date(d + 'T23:59:59'), hm = x => x.toTimeString().slice(0, 5);
    const res = await gfetch(`${GCAL}?${new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '50' })}`);
    if (!res.ok) return;
    const j = await res.json();
    GC.ev.set(d, (j.items || []).filter(e => e.status !== 'cancelled' && e.extendedProperties?.private?.tfm !== '1' && e.extendedProperties?.private?.planner !== '1')
      .map(e => e.start?.date ? { title: e.summary || '(제목 없음)', allDay: true, link: e.htmlLink } : { title: e.summary || '(제목 없음)', link: e.htmlLink, start: hm(new Date(e.start.dateTime)), end: hm(new Date(e.end.dateTime)) }));
    if (S.view === 'todo') render();
  } catch { /* 다음에 다시 */ }
}
let gTimer = 0;
const gSoon = () => { if (!gOn()) return; clearTimeout(gTimer); gTimer = setTimeout(gPush, 4000); };
const gHash = b => [b.date, b.start, b.end, b.title, b.done ? 1 : 0, b.cat || 0].join('|');
async function gPush() {
  const since = addD(ymd(), -1), list = [...S.items.values()].filter(b => b.kind === 'block' && (b.deleted ? b.gs : b.gs !== gHash(b) && b.date >= since));
  for (const b of list.slice(0, 40)) {
    const url = `${GCAL}/tf${b.id.slice(1)}`;
    try {
      if (b.deleted) { const r = await gfetch(url, { method: 'DELETE' }); if (r.ok || r.status === 404 || r.status === 410) { b.gs = ''; put(b, true); } continue; }
      const body = { summary: (b.done ? '✓ ' : '') + b.title, description: 'thinkingForMe · ' + catOf(b.cat).n, start: { dateTime: `${b.date}T${b.start}:00`, timeZone: 'Asia/Seoul' }, end: { dateTime: `${b.date}T${b.end}:00`, timeZone: 'Asia/Seoul' }, colorId: catOf(b.cat).g, reminders: { useDefault: false, overrides: [] }, extendedProperties: { private: { tfm: '1' } } };
      let r = await gfetch(url, { method: 'PATCH', body: JSON.stringify(body) });
      if (r.status === 404) r = await gfetch(GCAL, { method: 'POST', body: JSON.stringify({ ...body, id: 'tf' + b.id.slice(1) }) });
      if (r.status === 409) r = await gfetch(url, { method: 'PATCH', body: JSON.stringify({ ...body, status: 'confirmed' }) });
      if (r.ok) { b.gs = gHash(b); put(b, true); } else break;
    } catch { break; }
  }
}
function gConnect() {
  if (!sb) return toast('지금은 연결할 수 없습니다');
  ls.set('tfm:gpending', '1');
  sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname, scopes: 'https://www.googleapis.com/auth/calendar.events', queryParams: { access_type: 'offline', prompt: 'consent' } } });
}

// ── 자판기와 잇기 ─────────────────────────────────────────────────────
// 자판기에서 남긴 생각·질문·메모·별표·좋아요를 생각으로 가져옵니다 (읽기만 함, 자판기 기록은 그대로).
// 같은 주소(jeffreryinko.github.io)라 이 기기의 자판기 기록을 바로 읽고, 다른 기기 것은 자판기가 올려 둔 서버 칸(kv)에서 읽습니다.
const VFM_APPS = { ai: 'AI 소식', history: '세계사', tools: '도구', deal: '딜', brain: '뇌', book: '책', sisa: '시사', iyagi: '이야기', mental: '멘탈', baedat: '배댓', 'sisa-learn': '세상 읽기 교실', 'deal-learn': '딜 교실', 'ai-learn': 'AI 교실', 'gicho-learn': '기초 교실' };
async function vfmImport(manual) {
  const src = new Map(), mergeV = (a, b) => Array.isArray(a) && Array.isArray(b) ? [...new Map([...a, ...b].filter(x => x && x.id).map(x => [x.id, x])).values()] : a && b && typeof a === 'object' && typeof b === 'object' ? { ...a, ...b } : (b ?? a);
  if (sb) try {
    const rs = await Promise.all(['vfm:box:%', 'vfm:%:star', 'vfm:%:memo', 'vfm:likes', 'vfm:trail'].map(pat => sb.from('kv').select('k,v').like('k', pat)));
    rs.forEach(r => (r.data || []).forEach(x => src.set(x.k, x.v)));
  } catch (e) { console.warn(e); }
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (/^vfm:(box:(qs|think)|[a-z]+:(star|memo)|likes|trail)$/.test(k)) try { src.set(k, mergeV(src.get(k), JSON.parse(localStorage.getItem(k)))); } catch { /* 깨진 값은 건너뜀 */ }
  }
  let added = 0;
  const C = '자판기에서';
  const add = (id, o) => {
    id = id.slice(0, 80); if (S.items.has(id) || !o.t) return;
    const url = o.url || '';
    put({ id, kind: 'node', n: 1, st: 0, src: 'vfm', c: C, s: '', ...o, t: String(o.t).slice(0, 140), w: String(o.w || o.t).split(/\s+/)[0].slice(0, 8), at: o.at || Date.now(), ...(!o.img && yt(url) ? { img: yt(url) } : {}) }, true);
    added++;
  };
  const qs = new Map((src.get('vfm:box:qs') || []).map(q => [q.id, q]));
  for (const q of qs.values()) add('v_q_' + q.id, { t: q.t, k: '생각', g: '붙잡고 있는 질문', raw: q.t, at: q.at });
  for (const t of src.get('vfm:box:think') || []) {
    const parts = [t.f && '발견: ' + t.f, t.a && '내 일에 적용: ' + t.a, t.x && '틀렸다는 증거: ' + t.x].filter(Boolean);
    add('v_t_' + t.id, { t: t.f || t.a || t.x, k: '생각', g: qs.get(t.q)?.t || '읽다가 든 생각', raw: parts.join('\n'), s: t.title ? '읽은 글: ' + t.title : '', url: /^https?:/.test(t.url || '') ? t.url : '', at: t.at });
  }
  for (const [k, v] of src) {
    const m = k.match(/^vfm:([a-z]+):star$/); if (!m || !v || typeof v !== 'object') continue;
    const app = m[1], memos = src.get(`vfm:${app}:memo`) || {};
    for (const [id, x] of Object.entries(v)) {
      const it = x?.item || {}, memo = memos[id] || x?.memo || '';
      add(`v_s_${app}_${id}`, { t: it.ko || it.t || it.title || id, k: memo ? '의견' : '자료', g: '별표한 ' + (VFM_APPS[app] || app), s: it.ksum || it.one || it.sum || (it.a ? '지은이: ' + it.a : ''), raw: memo || '', url: /^https?:/.test(it.url || '') ? it.url : '', img: /^https?:/.test(it.img || '') ? it.img : /^https?:/.test(it.cv || '') ? it.cv : '', at: x?.at });
    }
  }
  for (const [id, x] of Object.entries(src.get('vfm:likes') || {})) add('v_l_' + id, { t: x.t || x.key, k: '자료', g: '좋아요한 글', url: /^https?:/.test(x.u || '') ? x.u : '', at: x.at });
  // 배운 길: 세 자판기 어디서든 '제대로 본 것'(40초 넘게 머묾 또는 3번 넘게 다시 봄)만 생각 지도의 '배운 것' 가지로
  for (const x of src.get('vfm:trail') || []) {
    if (!x || !x.id || !((x.d || 0) >= 40 || (x.n || 0) >= 3)) continue;
    const nid = 'v_tr_' + x.id.replace(/[^\w가-힣:-]/g, '_'), mins = Math.round((x.d || 0) / 60);
    if (S.items.has(nid.slice(0, 80))) { const o = S.items.get(nid.slice(0, 80)); if ((x.n || 1) > (o.n || 1)) put({ ...o, n: x.n }, true); continue; }
    add(nid, { t: x.t, k: '자료', g: '배운 것 · ' + (VFM_APPS[x.app] || x.app), s: `${x.n || 1}번 봄${mins ? ` · ${mins}분` : ''}`, n: x.n || 1, url: /^https?:/.test(x.u || '') ? x.u : '', at: x.first || x.at });
  }
  if (added) {  render(); toast(`자판기에서 ${added}개를 가져왔습니다`, '지도에서 보기', () => go('map')); }
  else if (manual) toast('자판기에서 새로 가져올 것이 없습니다');
}

let IP = null;   // 브라우저가 주는 '앱 설치' 기회
addEventListener('beforeinstallprompt', e => { e.preventDefault(); IP = e; });

// ── 누르기 ───────────────────────────────────────────────────────────
// 새로고침: 서버의 최신 기록·자판기·구글 일정을 다시 받고, 사이트가 새로 바뀌었으면 화면을 새로 엶
let rfBusy = false;
async function reloadAll() {
  if (rfBusy) return; rfBusy = true; $('#rfBtn')?.classList.add('spin');
  try {
    const reg = await navigator.serviceWorker?.getRegistration().catch(() => null);
    await reg?.update().catch(() => {});
    if (reg?.installing || reg?.waiting) { location.reload(); return; }
    await pull(); GC.ev.clear(); GC.loading.clear(); render(); flush(); await vfmImport();
    toast('새로 불러왔습니다', null, null, 2000);
  } catch (e) { console.warn(e); toast('새로 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'); }
  finally { rfBusy = false; $('#rfBtn')?.classList.remove('spin'); }
}
// 목록 맨 위에서 아래로 당기면 새로고침
(() => {
  let y0 = null, dy = 0;
  const m = () => $('#main');
  addEventListener('touchstart', e => { y0 = m() && !m().classList.contains('board') && m().scrollTop <= 0 && $('#sheet').hidden && m().contains(e.target) ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
  addEventListener('touchmove', e => { if (y0 == null) return; dy = e.touches[0].clientY - y0; m().style.transform = dy > 0 ? `translateY(${Math.min(dy, 120) / 2}px)` : ''; }, { passive: true });
  addEventListener('touchend', () => { if (y0 == null) return; m().style.transform = ''; if (dy > 90) reloadAll(); y0 = null; });
})();

window.ACT = {
  refresh: reloadAll,
  wNote: () => { const v = $('#w_note').value.trim(); if (!v) return toast('느낀 것을 먼저 적어 주세요'); const w = S.items.get(S.selW); (w.notes ||= []).push({ at: Date.now(), text: v, prog: w.prog || '' }); put(w, true); bump(true); render(); drawWork(w.id); toast('남겼습니다'); },
  wAI: () => workAI(S.selW), wEdit: () => editWork(S.selW), wImg: () => openWImg(S.selW),
  wSave: () => { const w = S.items.get(S.selW), v = k => $('#we_' + k).value.trim(); for (const k of ['title', 'orig', 'year', 'creator', 'cast', 'genre', 'country', 'len', 'syn', 'hist', 'bg']) w[k] = v(k); w.title ||= '제목 없음'; w.type = v('type'); w.der = v('der').split('\n').map(x => x.trim()).filter(Boolean).map(x => { const [t, ...r] = x.split(' - '); return { t: t.trim(), rel: r.join(' - ').trim() }; }); put(w, true); render(); toast('저장했습니다'); history.back(); },
  wDel: () => { if (!confirm('이 작품을 지울까요?')) return; const w = S.items.get(S.selW); w.deleted = true; put(w, true); render(); toast('작품을 지웠습니다'); history.back(); },
  mapFull: () => { S.mapFull = true; render(); }, mapPhone: () => { S.mapFull = false; render(); },
  theme: () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = t; ls.set('tfm:theme', t); },
  close: closeAll, back: () => history.back(), search: () => openSearch(), settings: openSettings, lock: toggleLock, mantra: openMantra,
  edit: () => editNode(S.sel), save: () => saveNode(S.sel), organize: () => organize(S.sel), persp: () => perspectives(S.sel),
  toPlanner: () => toPlanner(S.sel), linkAdd: () => openSearch(S.sel), weekly, askQ: () => ask($('#q').value.trim()),
  mantraSave: () => setMantra($('#m_in').value), mantraAi, imgPick: () => openImg(S.sel), fillImages, vfmPull: () => vfmImport(true),
  imgDrop: () => { const n = node(S.sel); delete n.img; delete n.imgSrc; delete n.th; if (n.ph) { n.ph = false; const p = S.items.get('ph_' + n.id); if (p) { p.deleted = true; put(p, true); } } put(n, true); openNode(n.id); render(); },
  togglePrivate: () => { const n = node(S.sel); n.p = !n.p; put(n, true);  if (n.p && !S.unlocked) { toast('잠금 영역으로 옮겼습니다'); closeAll(); } else { openNode(n.id); render(); } },
  del: () => { if (!confirm('이 생각을 지울까요?')) return; const n = node(S.sel); n.deleted = true; put(n, true); all('link').filter(l => l.a === n.id || l.b === n.id).forEach(l => { l.deleted = true; put(l, true); });  toast('생각을 지웠습니다'); closeAll(); },
  linkType: el => { const l = S.items.get(el.dataset.id); l.r = l.r === 'contra' ? 'rel' : 'contra'; l.by = 'me'; put(l, true);  openNode(S.sel); },
  linkDel: el => { const l = S.items.get(el.dataset.id); l.deleted = true; put(l, true);  openNode(S.sel); },
  fit: () => fitBoard(true, true), zin: () => zoomAt(1.3), zout: () => zoomAt(1 / 1.3),
  qmode: () => { const ks = Object.keys(QM); setQm(ks[(ks.indexOf(S.qm || 'think') + 1) % ks.length]); $('#quickIn').focus(); },
  blockNew: () => openSched(), schSave: () => {
    const { tid, bid } = S.sch, t = tid && S.items.get(tid), d = $('#s_date').value || ymd(), st = $('#s_start').value || '09:00', end = toHm(toMin(st) + +$('#s_dur').value);
    if (bid) { const b = S.items.get(bid); Object.assign(b, { date: d, start: st, end, title: $('#s_title')?.value.trim() || b.title }); put(b, true); gSoon(); }
    else if (t) addBlock({ date: d, start: st, end, title: t.title, cat: t.cat, taskId: t.id });
    else { const title = $('#s_title').value.trim(); if (!title) return toast('무엇을 할지 적어 주세요'); addBlock({ date: d, start: st, end, title, cat: 0 }); }
    toast(`${relDay(d)} ${st}에 넣었습니다`); history.back();
  },
  bDel: () => { const b = S.items.get(S.sch.bid); b.deleted = true; put(b, true); gSoon(); toast('시간 블록을 지웠습니다'); history.back(); },
  tSave: () => { const t = S.items.get(S.selT), v = k => $('#t_' + k).value.trim(); Object.assign(t, { title: v('title') || t.title, cat: +($('.catp .on')?.dataset.tcat || 0), due: v('due'), who: v('who').replace(/^@/, ''), tags: v('tags').split(/\s+/).map(x => x.replace(/^#/, '')).filter(Boolean), note: v('note') }); put(t, true); all('block').filter(b => b.taskId === t.id).forEach(b => { b.title = t.title; b.cat = t.cat; put(b, true); }); gSoon(); toast('저장했습니다'); history.back(); },
  tTop: () => { const d = S.td || ymd(), day = dayRec(d); day.top ||= []; if (day.top.includes(S.selT)) day.top = day.top.filter(x => x !== S.selT); else if (day.top.length >= 3) return toast('핵심은 3개까지입니다'); else day.top.push(S.selT); put(day, true); drawTask(S.selT); },
  tWait: () => { const t = S.items.get(S.selT); t.st = t.st === 'wait' ? 'open' : 'wait'; put(t, true); drawTask(S.selT); },
  tDel: () => { if (!confirm('이 할 일을 지울까요?')) return; const t = S.items.get(S.selT); t.deleted = true; put(t, true); all('block').filter(b => b.taskId === t.id).forEach(b => { b.deleted = true; put(b, true); }); gSoon(); toast('할 일을 지웠습니다'); history.back(); },
  closeDay: () => { const d = S.td || ymd(), day = dayRec(d); day.note = $('#dayNote').value.trim(); day.closedAt = Date.now(); put(day, true); bump(); render(); toast('오늘을 마감했습니다. 수고하셨습니다.'); },
  reopenDay: () => { const day = dayRec(S.td || ymd()); delete day.closedAt; put(day, true); render(); },
  carry: () => { const d = S.td || ymd(); let n = 0; blocksOn(d).filter(b => !b.done).forEach(b => { b.date = addD(d, 1); put(b, true); n++; }); gSoon(); render(); toast(`${n}개를 내일 같은 시간으로 넘겼습니다`); },
  showDone: () => { S.showDone = !S.showDone; render(); },
  gConnect, gOff: () => { ['tfm:gcal', 'tfm:gtok'].forEach(k => ls.set(k, '')); GC.state = 'off'; GC.ev.clear(); toast('구글 캘린더 연결을 껐습니다'); history.back(); },
  remind: el => { const s = settings(); s.remindMin = +el.value; put(s, true); },
  another: () => { S.rs = (S.rs || 0) + 1; render(); },
  chainGo: () => { S.flow = 'chain'; S.chain = S.sel; S.after = () => S.view === 'time' ? render() : go('time'); closeAll(); },
  install: async () => { if (!IP) return; IP.prompt(); await IP.userChoice; IP = null; history.back(); },
  aiSave: () => { const s = settings(); for (const [p, P] of Object.entries(PROV)) { s[P.key] = $('#k_' + p).value.trim(); s[P.model] = $('#m_' + p).value.trim() || P.def; } s.cap = Math.max(1, +$('#s_cap').value || 20); put(s, true); toast('AI 설정을 저장했습니다'); },
  notiAdd: () => notiChange(a => a.push({ id: newId().slice(0, 6), kind: 'nudge', time: '18:00', days: [1, 2, 3, 4, 5, 6, 7], on: true })),
  notiDel: el => notiChange(a => a.splice(+el.dataset.id, 1)),
  pushOn, pushOff, pushTest: async () => { if (!sb) return; const { data, error } = await sb.rpc('think_push_test'); toast(error ? '알림을 보내지 못했습니다' : data ? '알림을 보냈습니다' : '알림을 켠 기기가 없습니다'); },
  pinSet: async () => { const p = prompt('새 비밀번호'); if (!p) return; const s = settings(); s.pin = await sha(p); put(s, true); openSettings(); },
  pinClear: () => { const s = settings(); delete s.pin; put(s, true); openSettings(); },
  logout: async () => { await flush(); if (sb) await sb.auth.signOut(); ['tfm:cache', 'tfm:q'].forEach(k => localStorage.removeItem(k)); location.reload(); },
  export: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify([...S.items.values()], null, 1)], { type: 'application/json' })); a.download = `thinkingForMe-${ymd()}.json`; a.click(); },
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-node],[data-go],[data-tog],[data-pick],[data-mantra],[data-day],[data-img],[data-wk],[data-wmode],[data-wst],[data-wrate],[data-wthink],[data-wwant],[data-wimg],[data-mk],[data-mto],[data-tdone],[data-bdone],[data-tk],[data-bk],[data-tsched],[data-top],[data-picktop],[data-tcat],[data-tday],[data-tmode],[data-calm],[data-cald],[data-depth],[data-flow],[data-topic],[data-chain]'); if (!t) return;
  if (B.drag > 8 && t.closest('#bd')) return;   // 보드를 끌다가 손을 뗀 것은 누른 것으로 치지 않음
  const d = t.dataset;
  if (d.act) return window.ACT[d.act]?.(t);
  if (d.wk) return openWork(d.wk);
  if (d.wmode) { S.wmode = d.wmode; return render(); }
  if (d.wst) { const w = S.items.get(S.selW); w.st = d.wst; if (d.wst === 'done' && !w.end) w.end = ymd(); if (d.wst === 'doing' && !w.start) w.start = ymd(); put(w, true); render(); return drawWork(w.id); }
  if (d.wrate) { const [id, r] = d.wrate.split(':'), w = S.items.get(id); w.rate = w.rate === +r ? 0 : +r; put(w, true); render(); return drawWork(id); }
  if (d.wthink) { const w = S.items.get(S.selW), nt = w.notes[+d.wthink], n = put({ id: newId(), kind: 'node', t: nt.text.slice(0, 140), w: w.title.slice(0, 8), s: `${w.title}을 ${w.type === '책' ? '읽고' : '보고'}`, raw: nt.text, c: '작품·취향', g: w.title.slice(0, 30), k: '의견', at: nt.at, n: 1, st: 0, src: 'work', ...(w.img ? { img: w.img } : {}) }, true); nt.nid = n.id; put(w, true); toast('생각 지도의 작품·취향 가지에 넣었습니다'); return drawWork(w.id); }
  if (d.wwant) { if (works().some(w => w.title.replace(/\s/g, '') === d.wwant.replace(/\s/g, ''))) return toast('이미 목록에 있습니다'); put({ id: 'w' + id32(), kind: 'work', title: d.wwant, type: '기타', st: 'want', notes: [], at: Date.now() }, true); render(); return toast(`'${d.wwant}'을 볼 것에 넣었습니다`); }
  if (d.wimg) { const w = S.items.get(S.selW); w.img = d.wimg; put(w, true); render(); return history.back(); }
  if (d.mk) { (S.mpath ||= []).push(d.mk); NAV.push('lvl'); stamp(); render(); $('#main').scrollTop = 0; return; }
  if (d.mto != null) return orbitTo(+d.mto);
  if (d.tdone) { const t = S.items.get(d.tdone); return t && setDone(t, t.st !== 'done'); }
  if (d.bdone) { const b = S.items.get(d.bdone); if (!b) return; b.done = !b.done; put(b, true); gSoon(); if (SH.at(-1)?.key === 'sched') history.back(); return render(); }
  if (d.tk) return openTask(d.tk);
  if (d.bk) return openSched('', d.bk);
  if (d.tsched) return openSched(d.tsched);
  if (d.top) return openTopPick(+d.top);
  if (d.picktop) { const day = dayRec(S.td || ymd()); (day.top ||= []).push(d.picktop); put(day, true); return history.back(); }
  if (d.tcat) { document.querySelectorAll('.catp button').forEach(b => b.classList.toggle('on', b === t)); return; }
  if (d.tday) { S.td = d.tday === '0' ? ymd() : addD(S.td || ymd(), +d.tday); return render(); }
  if (d.tmode) { S.tmode = d.tmode; return render(); }
  if (d.calm) { const [y, m] = (S.calM || ymd().slice(0, 7)).split('-').map(Number), t = new Date(y, m - 1 + +d.calm, 1); S.calM = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`; S.calD = ''; return render(); }
  if (d.cald) { S.calD = d.cald; return render(); }
  if (d.go) return go(d.go);
  if (d.depth) { S.depth = +d.depth; ls.set('tfm:depth', S.depth); S.open.clear(); ls.set('tfm:open', '[]'); return render(); }
  if (d.flow) { S.flow = d.flow; ls.set('tfm:flow', d.flow); return render(); }
  if (d.topic) { S.topic = d.topic; return render(); }
  if (d.chain != null) { S.chain = d.chain; render(); $('#main').scrollTop = 0; return; }
  if (d.node) return openNode(d.node);
  if (d.pick) { addLink(S.pick, d.pick);  toast('두 생각을 이었습니다'); return history.back(); }
  if (d.mantra) return setMantra(d.mantra);
  if (d.img) { const n = node(S.sel); n.img = d.img; n.imgSrc = d.src; n.kw = $('#imgQ').value.trim(); delete n.th; put(n, true);  return history.back(); }
  if (d.day) { const [i, j] = d.day.split(':').map(Number); return notiChange(a => { const ds = new Set(a[i].days || []); ds.has(j) ? ds.delete(j) : ds.add(j); a[i].days = [...ds].sort(); }); }
  if (d.tog) { const k = d.tog, opening = !isOpen(k, +d.lvl); if (!opening) { S.open.add('!' + k); S.open.delete(k); } else { S.open.add(k); S.open.delete('!' + k); } ls.set('tfm:open', JSON.stringify([...S.open]));
    const was = B.items.find(i => i.tog === k); render();
    const now = B.items.find(i => i.tog === k);   // 누른 가지가 화면에서 제자리에 있도록 판을 맞춰 옮김
    if (was && now) { B.tx += (was.x - now.x) * B.k; B.ty += (was.y - now.y) * B.k; applyT(); }
    if (opening) focusOn(k);
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.noti != null) notiChange(a => { const n = a[+t.dataset.noti]; n[t.dataset.k] = t.dataset.k === 'on' ? t.checked : t.dataset.k === 'time' ? round5(t.value || '09:00') : t.value; });
  if (t.id === 'photoIn' && t.files[0]) addPhoto(S.sel, t.files[0]);
  if (t.id === 'wPhoto' && t.files[0]) workPhoto(S.selW, t.files[0]);
  if (t.dataset.wfield) { const w = S.items.get(S.selW); w[t.dataset.wfield] = t.value.trim(); put(w, true); render(); }
});
document.addEventListener('error', e => { const t = e.target; if (t.tagName === 'IMG' && t.classList.contains('th')) { t.removeAttribute('src'); t.style.visibility = 'hidden'; } }, true);
$('#quick').addEventListener('submit', e => { e.preventDefault(); const i = $('#quickIn'), m = S.qm || 'think'; m === 'think' ? addThought(i.value) : m === 'work' ? addWork(i.value) : addTodo(i.value, m === 'urgent'); i.value = ''; });
addEventListener('hashchange', () => { const v = location.hash.slice(1); if (['review', 'todo'].includes(v)) { history.replaceState(history.state, '', location.pathname); go(v); } });
addEventListener('online', flush);
addEventListener('resize', () => { if ($('#bd')) applyT(); });
addEventListener('keydown', e => { if (S.view !== 'map' || /INPUT|TEXTAREA/.test(document.activeElement?.tagName) || !$('#sheet').hidden) return; if (e.key === '+' || e.key === '=') zoomAt(1.2); else if (e.key === '-') zoomAt(1 / 1.2); else if (e.key === '0') fitBoard(true, true); });
addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });

// ── 시작: 로그인 → 내 계정 확인 → 불러오기 ────────────────────────────
function gate(html) { $('#app').hidden = true; $('#gate').hidden = false; $('#gate').innerHTML = `<h1>thinkingForMe</h1>${html}`; }
const opened = () => { if (Date.now() - +(ls.get('tfm:lastOpen') || 0) > 30 * 60e3) { ls.set('tfm:lastOpen', Date.now()); bump(); return true; } };
async function start(user) {
  S.user = user;
  try { JSON.parse(ls.get('tfm:cache') || '[]').forEach(i => S.items.set(i.id, i)); } catch { /* 저장본 없음 */ }
  $('#gate').hidden = true; $('#app').hidden = false;
  if (['#review', '#todo'].includes(location.hash)) S.view = location.hash.slice(1);
  if (S.view === 'todo') setQm('todo');
  history.replaceState({ tfm: 0 }, '', location.pathname); stamp();          // 뒤로가기를 받아 줄 한 칸
  addEventListener('pointerdown', stamp, { once: true });                    // 첫 손길 뒤에 한 칸 더 (브라우저가 손길 없는 칸은 건너뛰기 때문)
  render();
  try { await pull(); } catch (e) { console.warn(e); toast('서버에서 불러오지 못했습니다. 이 기기에 저장해 둔 것을 보여 드립니다.'); }
  opened(); render(); flush();
  vfmImport();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && opened()) pull().then(render).then(() => vfmImport()).catch(() => {}); });
}
async function boot() {
  if ('serviceWorker' in navigator && !TEST) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (TEST) return start(TEST.user);
  gate('<p>불러오는 중입니다.</p>');
  try {
    await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js'; s.crossOrigin = 'anonymous'; s.onload = ok; s.onerror = no; document.head.append(s); });
    sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } });
  } catch { return gate('<p>로그인 도구를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 열어 주세요.</p><div><button class="btn pri" onclick="location.reload()">다시 열기</button></div>'); }
  const { data } = await sb.auth.getSession();
  const user = data.session?.user, ses = data.session;
  if (ses?.provider_token && ls.get('tfm:gpending')) {   // 구글 캘린더 연결 직후: 이 순간에만 받을 수 있는 토큰을 받아 둠
    ls.set('tfm:gpending', ''); ls.set('tfm:gtok', JSON.stringify({ t: ses.provider_token, exp: Date.now() + 50 * 60e3 })); ls.set('tfm:gcal', '1'); GC.state = 'on';
    if (ses.provider_refresh_token) sb.rpc('planner_google_set', { p_token: ses.provider_refresh_token }).then(() => {}, () => {});
  }
  if (!user) {
    gate('<p>내가 한 생각, 의견, 사업 구상을 한 단어부터 원문까지 깊이를 바꿔 가며 봅니다.</p><div><button class="btn pri" id="loginBtn">Google 계정으로 로그인</button></div>');
    $('#loginBtn').onclick = () => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
    return;
  }
  const { data: ok } = await sb.rpc('think_is_owner');
  if (!ok) {
    gate(`<p>${esc(user.email)} 계정으로는 열 수 없습니다. 허용된 계정으로 다시 로그인해 주세요.</p><div><button class="btn" id="outBtn">다른 계정으로 로그인</button></div>`);
    $('#outBtn').onclick = async () => { await sb.auth.signOut(); location.reload(); };
    return;
  }
  start({ id: user.id, email: user.email });
}
boot();
