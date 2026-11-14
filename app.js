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
const KINDS = { 생각: '💭', 의견: '🧭', 구상: '🚀', 자료: '📎', 기록: '📝' };
const STAGES = ['씨앗', '새싹', '나무'];
const NEEDS = ['돈', '시간', '인정', '재미', '편리', '연결', '성장', '안정', '건강'];
const NOTI = { mantra: '만트라', nudge: '한 줄 적기 알림', review: '주간 회고' };

const S = { items: new Map(), user: null, depth: +(ls.get('tfm:depth') || 2), unlocked: false, view: 'home', open: new Set(JSON.parse(ls.get('tfm:open') || '[]')) };
let sb = null, queue = new Set(JSON.parse(ls.get('tfm:q') || '[]'));

// ── 자료 ─────────────────────────────────────────────────────────────
const all = kind => [...S.items.values()].filter(i => i.kind === kind && !i.deleted);
const node = id => { const n = S.items.get(id); return n && !n.deleted && n.kind === 'node' ? n : null; };
const vis = n => n && (S.unlocked || !n.p);
const nodes = () => all('node').filter(vis);
const links = () => all('link').filter(l => vis(node(l.a)) && vis(node(l.b)));
const settings = () => S.items.get('settings') || { id: 'settings', kind: 'settings', notis: [] };
const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const color = c => `hsl(${hue(c)} 75% 70%)`;

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
  } catch (e) { console.warn(e); toast('서버에 저장하지 못했어요. 연결되면 다시 올립니다.'); }
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
    toast(`비슷한 생각과 합쳤어요 (×${hit.n})`, '따로 두기', () => { S.items.set(hit.id, JSON.parse(before)); put(S.items.get(hit.id), true); create(text); });
    return;
  }
  create(text);
}
function create(text) {
  const n = put({ id: newId(), kind: 'node', t: text.slice(0, 140), w: text.split(/\s+/)[0].slice(0, 8), s: '', raw: text, c: '미분류', g: '새 생각', k: '생각', at: Date.now(), n: 1, st: 0, src: 'me' });
  toast('별 하나가 생겼어요', settings().gkey ? 'AI 정리' : '열기', () => settings().gkey ? organize(n.id) : openNode(n.id));
}

// ── AI (Gemini) — 버튼을 누를 때만 부릅니다 ────────────────────────────
async function gem(prompt) {
  const s = settings();
  if (!s.gkey) { toast('설정에서 Gemini 키를 먼저 넣어 주세요', '설정', openSettings); throw new Error('nokey'); }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.gmodel || 'gemini-flash-latest')}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.gkey },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } }),
  });
  if (!res.ok) throw new Error(res.status === 429 ? '무료 한도를 넘었어요. 잠시 뒤 다시 눌러 주세요.' : `AI 오류 (${res.status})`);
  const j = await res.json();
  const txt = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  return JSON.parse(txt.replace(/^```json\s*|```\s*$/g, ''));
}
async function busy(label, fn) {
  const t = toast(label + '…', null, null, 60000);
  try { return await fn(); } catch (e) { if (e.message !== 'nokey') toast(e.message || 'AI 요청에 실패했어요'); console.warn(e); }
  finally { t.remove(); }
}
const groupsText = () => [...new Set(all('node').map(n => `${n.c} > ${n.g}`))].join('\n');

async function organize(id) {
  const n = node(id); if (!n) return;
  const cand = nearest(n.raw || n.t, 25, id).map(([, m]) => `${m.id}|${m.t}`).join('\n');
  const r = await busy('AI가 정리하는 중', () => gem(`너는 한 사람의 생각 노트를 정리하는 조수다. 아래 "새 생각"을 정리해 JSON 하나로만 답하라. 한국어. 사용자가 하지 않은 말을 지어내지 말 것.
형식: {"w":"핵심 단어 1개(6자 이내)","t":"한 줄(40자 이내)","s":"요약 1~2문장","d":"상세 3~5문장(생각의 배경·의미·열린 질문)","c":"대분류","g":"연결 주제","k":"생각|의견|구상|자료|기록 중 하나","needs":["${NEEDS.join('","')}" 중 이 생각이 건드리는 사람들의 욕구 0~3개],"next":"다음 한 걸음(구상일 때만, 20자 이내, 없으면 빈 문자열)","links":[{"id":"관련 생각 id","r":"rel 또는 contra(서로 부딪히면)","why":"한 줄 이유"}]}
c와 g는 가능하면 아래 "기존 분류"에서 고르고, 정말 맞는 게 없을 때만 새로 만든다. links는 "후보"의 id만 쓰고 최대 4개.

[새 생각]
${n.raw || n.t}

[기존 분류]
${groupsText()}

[후보]
${cand}`));
  if (!r) return;
  (n.hist ||= []).push({ at: Date.now(), t: n.t, s: n.s });
  Object.assign(n, {
    w: String(r.w || n.w).slice(0, 12), t: String(r.t || n.t).slice(0, 140), s: String(r.s || ''), d: String(r.d || ''),
    c: String(r.c || n.c), g: String(r.g || n.g), k: KINDS[r.k] ? r.k : n.k, needs: (r.needs || []).filter(x => NEEDS.includes(x)), next: String(r.next || ''), ai: Date.now(),
  });
  for (const l of r.links || []) if (node(l.id) && l.id !== id) addLink(id, l.id, l.r === 'contra' ? 'contra' : 'rel', l.why, 'ai');
  put(n); openNode(id);
  toast('정리했어요. 틀린 연결은 눌러서 고칠 수 있어요.');
}
async function perspectives(id) {
  const n = node(id); if (!n) return;
  const r = await busy('세 사람의 눈으로 보는 중', () => gem(`아래 구상을 세 관점에서 냉정하게 평가해 JSON으로만 답하라. 한국어, 각 항목 1~2문장.
형식: {"inv":"투자자가 볼 것(시장·수익·위험)","cus":"고객이 느낄 것(쓸 이유·안 쓸 이유)","com":"경쟁자가 볼 것(이미 있는 것·빈틈)","need":"이 구상이 건드리는 사람들의 욕구와 그 강도(추정임을 전제)","needs":["${NEEDS.join('","')}" 중 0~3개]}

[구상] ${n.t}
${n.s || ''} ${n.d || ''}`));
  if (!r) return;
  n.v = { inv: r.inv, cus: r.cus, com: r.com, need: r.need };
  if (r.needs?.length) n.needs = r.needs.filter(x => NEEDS.includes(x));
  put(n); openNode(id);
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
function body(n, d = S.depth) {
  if (d <= 1) return `<b class="w">${esc(n.w || n.t.split(' ')[0])}</b>`;
  let o = `<b>${esc(n.t)}</b>`;
  if (d >= 3 && n.s) o += `<p>${esc(n.s)}</p>`;
  if (d >= 4) {
    if (n.d) o += `<p>${esc(n.d)}</p>`;
    o += `<div class="chips"><span class="chip">${esc(n.c)} · ${esc(n.g)}</span><span class="chip">${STAGES[n.st || 0]}</span>${(n.needs || []).map(x => `<span class="chip gold">${esc(x)}</span>`).join('')}${n.next ? `<span class="chip">→ ${esc(n.next)}</span>` : ''}</div>`;
    if (n.v) o += views(n.v);
  }
  if (d >= 5) {
    if (n.raw && n.raw !== n.s) o += `<p class="raw">“${esc(n.raw)}”</p>`;
    for (const x of n.hist || []) o += `<p class="raw">${ymd(new Date(x.at))} · ${x.again ? '다시 떠올림: ' + esc(x.again) : '이전: ' + esc(x.t || '') + (x.s ? ' — ' + esc(x.s) : '')}</p>`;
  }
  return o;
}
const views = v => `<div class="view3">${v.inv ? `<div><b>투자자</b>${esc(v.inv)}</div>` : ''}${v.cus ? `<div><b>고객</b>${esc(v.cus)}</div>` : ''}${v.com ? `<div><b>경쟁자</b>${esc(v.com)}</div>` : ''}${v.need ? `<div><b>사람들 욕구(AI 추정)</b>${esc(v.need)}</div>` : ''}</div>`;
const card = (n, d) => `<button class="card" style="--c:${color(n.c)}" data-node="${n.id}"><span class="ic">${n.p ? '🔒' : KINDS[n.k] || '💭'}</span><span class="bd">${body(n, d)}</span>${(n.n || 1) > 1 ? `<span class="x">×${n.n}</span>` : ''}</button>`;
const byNew = (a, b) => (b.at || 0) - (a.at || 0);

function viewHome() {
  const ns = nodes(), s = settings(), used = useOf(ymd());
  const weekAgo = Date.now() - 7 * DAY;
  const rep = ns.filter(n => (n.n || 1) > 1).sort((a, b) => b.n - a.n).slice(0, 5);
  const contra = links().filter(l => l.r === 'contra');
  return `<section class="hero"><div class="mantra">${esc(s.mantra || '오늘의 한 문장을 정해 보세요')}</div><small>오늘의 만트라 · <button data-act="mantra">바꾸기</button></small></section>
<div class="meter"><b>오늘 ${used}/5</b><div class="dots">${[0, 1, 2, 3, 4].map(i => `<i class="${i < used ? 'fill' : ''}"></i>`).join('')}</div><span>연속 ${streak()}일</span></div>
<div class="stats"><div class="stat"><b>${ns.length}</b><span>쌓인 생각</span></div><div class="stat"><b>${ns.filter(n => n.at > weekAgo).length}</b><span>이번 주</span></div><div class="stat"><b>${links().length}</b><span>연결</span></div><div class="stat"><b>${ns.filter(n => n.k === '구상').length}</b><span>구상</span></div></div>
${rep.length ? `<h3>자주 돌아오는 생각</h3><div class="list">${rep.map(n => card(n)).join('')}</div>` : ''}
${contra.length ? `<h3>서로 부딪히는 생각</h3><div class="list">${contra.map(l => `<div class="box" style="margin:0"><div class="row"><button class="pill" data-node="${l.a}">${esc(node(l.a).w || node(l.a).t)}</button><span class="chip red">↔</span><button class="pill" data-node="${l.b}">${esc(node(l.b).w || node(l.b).t)}</button></div>${S.depth > 1 && l.why ? `<p style="margin:8px 0 0;font-size:13px;color:#cfd3f0">${esc(l.why)}</p>` : ''}</div>`).join('')}</div>` : ''}
<h3>최근 생각</h3><div class="list">${ns.sort(byNew).slice(0, 12).map(n => card(n)).join('') || '<p class="empty">아래 칸에 첫 생각을 한 줄 적어 보세요.</p>'}</div>`;
}

function viewMap() {
  const ns = nodes(), d = S.depth, tree = new Map();
  for (const n of ns) { if (!tree.has(n.c)) tree.set(n.c, new Map()); const g = tree.get(n.c); if (!g.has(n.g)) g.set(n.g, []); g.get(n.g).push(n); }
  const isOpen = (key, lvl) => S.open.has(key) ? !S.open.has('!' + key) : (d >= lvl && !S.open.has('!' + key));
  const cats = [...tree].sort((a, b) => [...b[1].values()].flat().length - [...a[1].values()].flat().length);
  const row = (inner, kids) => `<div class="mm-row">${inner}${kids ? `<div class="mm-k">${kids}</div>` : ''}</div>`;
  return `<div class="mmwrap"><div class="mm"><div class="mm-n root">나의 생각 ${ns.length}</div><div class="mm-k">${cats.map(([c, gs]) => {
    const cnt = [...gs.values()].flat().length, ck = 'c:' + c;
    return row(`<button class="mm-n cat" style="--c:${color(c)}" data-tog="${esc(ck)}" data-lvl="2">${esc(c)}<small>${cnt}</small></button>`,
      isOpen(ck, 2) && [...gs].map(([g, list]) => {
        const gk = 'g:' + c + '>' + g;
        return row(`<button class="mm-n grp" style="--c:${color(c)}" data-tog="${esc(gk)}" data-lvl="3">${esc(g)}<small>${list.length}</small></button>`,
          isOpen(gk, 3) && list.sort(byNew).map(n => row(`<button class="mm-n" style="--c:${color(c)}" data-node="${n.id}">${n.p ? '🔒 ' : ''}${d >= 4 ? body(n, d - 1 < 3 ? 3 : d) : esc(n.t)}${(n.n || 1) > 1 ? `<small>×${n.n}</small>` : ''}</button>`)).join(''));
      }).join(''));
  }).join('')}</div></div></div>`;
}

function viewTime() {
  const ns = nodes().sort(byNew), d = S.depth, by = new Map();
  for (const n of ns) { const k = d <= 1 ? ymd(new Date(n.at)).slice(0, 7) : ymd(new Date(n.at)); if (!by.has(k)) by.set(k, []); by.get(k).push(n); }
  return `<div class="tl">${[...by].map(([k, list]) => `<h3>${k} · ${list.length}개</h3>${d <= 1
    ? `<div class="words">${list.map(n => `<button style="--c:${color(n.c)}" data-node="${n.id}">${esc(n.w || n.t)}</button>`).join('')}</div>`
    : `<div class="list">${list.map(n => card(n)).join('')}</div>`}`).join('') || '<p class="empty">아직 생각이 없어요.</p>'}</div>`;
}

const weekKey = (d = new Date()) => { const t = new Date(d); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return ymd(t); };
function viewReview() {
  const ns = nodes(), wk = Date.now() - 7 * DAY, week = ns.filter(n => n.at > wk || (n.last || 0) > wk);
  const days = [...Array(14)].map((_, i) => ymd(new Date(Date.now() - (13 - i) * DAY)));
  const max = Math.max(5, ...days.map(useOf));
  const cats = new Map(); ns.forEach(n => cats.set(n.c, (cats.get(n.c) || 0) + 1));
  const top = [...cats].sort((a, b) => b[1] - a[1]), cmax = top[0]?.[1] || 1;
  const sorted = [...ns].sort((a, b) => a.at - b.at), W = 300, H = 70;
  const t0 = sorted[0]?.at || 0, t1 = Math.max(Date.now(), t0 + 1);
  const pts = sorted.map((n, i) => `${((n.at - t0) / (t1 - t0) * W).toFixed(1)},${(H - (i + 1) / sorted.length * (H - 6)).toFixed(1)}`).join(' ');
  const wcat = new Map(); week.forEach(n => wcat.set(n.g, (wcat.get(n.g) || 0) + 1));
  const revs = all('review').sort((a, b) => b.id.localeCompare(a.id));
  return `<h2>쌓인 것</h2>
<div class="stats"><div class="stat"><b>${ns.length}</b><span>생각</span></div><div class="stat"><b>${week.length}</b><span>이번 주 움직임</span></div><div class="stat"><b>${streak()}</b><span>연속 일</span></div><div class="stat"><b>${days.filter(x => useOf(x) >= 5).length}</b><span>5회 채운 날</span></div></div>
<div class="box"><h3 style="margin-top:0">생각이 쌓여 온 모습</h3><svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto"><polyline points="0,${H} ${pts} ${W},6" fill="none" stroke="#ffd678" stroke-width="2"/></svg><div class="btns"><button class="btn" data-act="replayGo">▶ 우주에서 성장 재생</button></div></div>
<div class="box"><h3 style="margin-top:0">최근 14일 사용 횟수 (노란 막대 = 5회 이상)</h3><div class="bars">${days.map(x => `<div class="${useOf(x) >= 5 ? 'ok' : ''}" style="height:${useOf(x) / max * 100}%" title="${x} · ${useOf(x)}회"></div>`).join('')}</div></div>
<div class="box"><h3 style="margin-top:0">어디에 생각이 몰려 있나</h3>${top.map(([c, n]) => `<div class="hb"><span>${esc(c)}</span><i style="--c:${color(c)};width:${n / cmax * 100}%"></i><span>${n}</span></div>`).join('')}</div>
<h2>이번 주 회고</h2>
<div class="box">${week.length ? `<p style="margin:0">이번 주에 움직인 생각 <b>${week.length}개</b>. 가장 많이 머문 주제: ${[...wcat].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g, n]) => `<span class="chip">${esc(g)} ${n}</span>`).join(' ')}</p>` : '<p style="margin:0;color:var(--dim)">이번 주에는 아직 움직인 생각이 없어요.</p>'}
<div class="btns"><button class="btn pri" data-act="weekly">AI 회고 만들기</button><button class="btn" data-act="ask">내 생각에 질문하기</button></div></div>
${revs.map(r => `<div class="box"><h3 style="margin-top:0">${r.id.slice(4)} 주</h3><div class="ans">${esc(r.text)}</div></div>`).join('')}`;
}
async function weekly() {
  const wk = Date.now() - 7 * DAY, week = nodes().filter(n => n.at > wk || (n.last || 0) > wk);
  if (!week.length) return toast('이번 주에 움직인 생각이 없어요');
  const r = await busy('이번 주를 돌아보는 중', () => gem(`한 사람이 이번 주에 적은 생각 목록이다. 주간 회고를 JSON으로만 답하라. 한국어, 존댓말. 지어내지 말고 목록에 있는 내용만 근거로.
형식: {"text":"회고 본문. ① 이번 주 생각이 흐른 방향 2~3문장 ② 반복되거나 서로 부딪힌 생각 ③ 다음 주에 실행으로 옮길 만한 한 가지. 줄바꿈으로 구분."}

${week.map(n => `- [${n.k}] ${n.t} : ${(n.s || '').slice(0, 120)}${(n.n || 1) > 1 ? ` (×${n.n})` : ''}`).join('\n')}`));
  if (r?.text) put({ id: 'rev:' + weekKey(), kind: 'review', text: String(r.text), at: Date.now() });
}

// ── 화면 그리기 ───────────────────────────────────────────────────────
function render() {
  if (!S.user) return;
  $('#depth').value = S.depth; $('#depthName').textContent = DEPTHS[S.depth];
  $('#lockBtn').textContent = S.unlocked ? '🔓' : '🔒'; $('#lockBtn').classList.toggle('on', S.unlocked);
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.go === S.view));
  const sky = S.view === 'graph';
  $('#main').classList.toggle('sky', sky); $('#sky').hidden = !sky; $('#skyUi').hidden = !sky;
  if (sky) { G.build(); return; }
  $('#main').innerHTML = S.view === 'map' ? viewMap() : S.view === 'time' ? viewTime() : S.view === 'review' ? viewReview() : viewHome();
}
function go(v) { S.view = v; if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v); render(); if (v !== 'graph') $('#main').scrollTop = 0; }

// ── 우주(연결 그래프) ─────────────────────────────────────────────────
const G = {
  pos: new Map(), n: [], l: [], cats: [], alpha: 0, tx: 0, ty: 0, k: 1, raf: 0, replay: null, stars: [...Array(140)].map(() => [Math.random(), Math.random(), Math.random()]),
  build() {
    const ns = nodes(), cats = [...new Set(ns.map(n => n.c))], R = Math.max(240, 46 * Math.sqrt(ns.length));
    G.R = R;
    G.cats = cats.map((c, i) => ({ c, x: Math.cos(i / cats.length * 6.283) * R, y: Math.sin(i / cats.length * 6.283) * R }));
    const idx = new Map();
    G.n = ns.map((n, i) => {
      const old = G.pos.get(n.id), cc = G.cats[cats.indexOf(n.c)];
      const o = old || { x: cc.x + (Math.random() - .5) * 160, y: cc.y + (Math.random() - .5) * 160, vx: 0, vy: 0 };
      o.n = n; o.c = cc; o.r = 3 + 1.8 * Math.sqrt(n.n || 1) + (n.st || 0) * 1.6; o.deg = 0;
      G.pos.set(n.id, o); idx.set(n.id, o); return o;
    });
    G.l = links().map(l => ({ a: idx.get(l.a), b: idx.get(l.b), r: l.r })).filter(l => l.a && l.b);
    G.l.forEach(l => { l.a.deg++; l.b.deg++; });
    G.alpha = Math.max(G.alpha, G.fitted ? 0.3 : 1);
    G.size(); if (!G.fitted) G.fit();
    G.run();
  },
  size() { const c = $('#sky'), d = devicePixelRatio || 1; G.W = c.clientWidth; G.H = c.clientHeight; c.width = G.W * d; c.height = G.H * d; },
  fit() { G.k = Math.min(G.W, G.H) / (2.9 * G.R) || 1; G.tx = 0; G.ty = 0; G.fitted = true; G.run(); },
  step() {
    const a = G.alpha, N = G.n;
    for (let i = 0; i < N.length; i++) {
      const p = N[i];
      for (let j = i + 1; j < N.length; j++) {
        const q = N[j]; let dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy;
        if (d2 > 32400) continue; if (d2 < 1) { dx = Math.random() - .5; dy = Math.random() - .5; d2 = 1; }
        const f = a * 520 / (d2 + 80); p.vx += dx * f; p.vy += dy * f; q.vx -= dx * f; q.vy -= dy * f;
      }
      p.vx += (p.c.x - p.x) * 0.016 * a; p.vy += (p.c.y - p.y) * 0.016 * a;
    }
    for (const l of G.l) {
      const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, d = Math.hypot(dx, dy) || 1, f = (d - 90) * 0.012 * a / d;
      l.a.vx += dx * f; l.a.vy += dy * f; l.b.vx -= dx * f; l.b.vy -= dy * f;
    }
    for (const p of N) { p.vx *= 0.82; p.vy *= 0.82; p.x += p.vx; p.y += p.vy; }
    G.alpha *= 0.985;
  },
  run() { if (!G.raf) G.raf = requestAnimationFrame(G.frame); },
  frame() {
    G.raf = 0;
    if (S.view !== 'graph') return;
    if (G.alpha > 0.02) G.step();
    if (G.replay) { G.replay.i += Math.max(0.25, G.n.length / 240); if (G.replay.i >= G.n.length + 30) { G.replay = null; $('#skyDate').textContent = ''; } }
    G.draw();
    if (G.alpha > 0.02 || G.replay) G.run();
  },
  draw() {
    const c = $('#sky'), x = c.getContext('2d'), d = devicePixelRatio || 1, { W, H, k } = G;
    x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, W, H);
    for (const [sx, sy, sz] of G.stars) { x.fillStyle = `rgba(255,255,255,${0.15 + sz * 0.35})`; x.fillRect(sx * W, sy * H, 1 + sz, 1 + sz); }
    x.setTransform(d * k, 0, 0, d * k, d * (W / 2 + G.tx), d * (H / 2 + G.ty));
    let shown = null;
    if (G.replay) { const order = [...G.n].sort((a, b) => a.n.at - b.n.at).slice(0, Math.floor(G.replay.i)); shown = new Set(order); const last = order[order.length - 1]; if (last) $('#skyDate').textContent = `${ymd(new Date(last.n.at))} · ${order.length}개`; }
    const on = p => !shown || shown.has(p);
    for (const l of G.l) {
      if (!on(l.a) || !on(l.b)) continue;
      x.strokeStyle = l.r === 'contra' ? 'rgba(255,110,130,.85)' : 'rgba(200,210,255,.2)'; x.lineWidth = (l.r === 'contra' ? 1.6 : 1) / k;
      if (l.r === 'contra') x.setLineDash([5 / k, 4 / k]); else x.setLineDash([]);
      x.beginPath(); x.moveTo(l.a.x, l.a.y); x.lineTo(l.b.x, l.b.y); x.stroke();
    }
    x.setLineDash([]);
    if (S.depth <= 2 || k < 0.7) for (const cc of G.cats) {
      x.font = `700 ${Math.min(34, 15 / k)}px "Pretendard Variable",sans-serif`; x.textAlign = 'center'; x.fillStyle = `hsl(${hue(cc.c)} 75% 70% / .5)`;
      x.fillText(cc.c, cc.x * 1.32, cc.y * 1.32);
    }
    for (const p of G.n) {
      if (!on(p)) continue;
      const h = hue(p.n.c), bright = 55 + (p.n.st || 0) * 12;
      x.shadowColor = `hsl(${h} 90% 70%)`; x.shadowBlur = (6 + p.r * 1.5);
      x.fillStyle = `hsl(${h} 85% ${bright}%)`; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.283); x.fill();
      x.shadowBlur = 0;
      if (p.n.p) { x.strokeStyle = '#fff'; x.lineWidth = 1 / k; x.stroke(); }
      const big = p.r > 6 || p.deg >= 3;
      if (k > 1.25 || (big && k > 0.5)) {
        const full = S.depth >= 2 && k > 1.25, txt = full ? (p.n.t.length > 18 ? p.n.t.slice(0, 17) + '…' : p.n.t) : (p.n.w || p.n.t.slice(0, 6));
        x.font = `${big ? 600 : 400} ${Math.max(10, 11 / Math.sqrt(k))}px "Pretendard Variable",sans-serif`; x.textAlign = 'center'; x.fillStyle = 'rgba(238,240,255,.92)';
        x.fillText(txt, p.x, p.y + p.r + 12 / Math.sqrt(k));
      }
    }
  },
  hit(cx, cy) {
    const r = $('#sky').getBoundingClientRect(), wx = (cx - r.left - G.W / 2 - G.tx) / G.k, wy = (cy - r.top - G.H / 2 - G.ty) / G.k;
    let best = null, bd = 1e9;
    for (const p of G.n) { const d = Math.hypot(p.x - wx, p.y - wy) - p.r; if (d < bd) { bd = d; best = p; } }
    return bd < 16 / G.k ? best : null;
  },
  init() {
    const c = $('#sky'), ptr = new Map(); let moved = 0, pinch = 0;
    c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); ptr.set(e.pointerId, [e.clientX, e.clientY]); if (ptr.size === 1) moved = 0; pinch = 0; });
    c.addEventListener('pointermove', e => {
      const p = ptr.get(e.pointerId); if (!p) return;
      if (ptr.size === 1) { G.tx += e.clientX - p[0]; G.ty += e.clientY - p[1]; moved += Math.abs(e.clientX - p[0]) + Math.abs(e.clientY - p[1]); }
      ptr.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptr.size === 2) { const [a, b] = [...ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) G.zoom(d / pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); pinch = d; moved = 99; }
      G.draw();
    });
    const up = e => { if (ptr.size === 1 && moved < 8) { const h = G.hit(e.clientX, e.clientY); if (h) openNode(h.n.id); } ptr.delete(e.pointerId); pinch = 0; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', e => { ptr.delete(e.pointerId); pinch = 0; });
    c.addEventListener('wheel', e => { e.preventDefault(); G.zoom(e.deltaY < 0 ? 1.12 : 0.89, e.clientX, e.clientY); G.draw(); }, { passive: false });
    addEventListener('resize', () => { if (S.view === 'graph') { G.size(); G.draw(); } });
  },
  zoom(f, cx, cy) {
    const r = $('#sky').getBoundingClientRect(), ox = cx - r.left - G.W / 2, oy = cy - r.top - G.H / 2, nk = Math.min(6, Math.max(0.15, G.k * f)); f = nk / G.k;
    G.tx = ox - (ox - G.tx) * f; G.ty = oy - (oy - G.ty) * f; G.k = nk;
  },
};

// ── 시트(아래에서 올라오는 창) ────────────────────────────────────────
function sheet(html) { $('#sheetBox').innerHTML = html; $('#sheet').hidden = false; $('#sheetBox').scrollTop = 0; }
const closeSheet = () => { $('#sheet').hidden = true; S.pick = null; };
function toast(msg, act, fn, ms = 5000) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
  if (act) { const b = document.createElement('button'); b.textContent = act; b.onclick = () => { el.remove(); fn(); }; el.append(b); }
  $('#toasts').append(el); setTimeout(() => el.remove(), ms); return el;
}

async function openNode(id) {
  const n = node(id); if (!n) return;
  S.sel = id;
  const ls_ = linksOf(id);
  sheet(`<div class="row"><span style="font-size:26px">${KINDS[n.k] || '💭'}</span><span class="chip" style="background:${color(n.c)};color:#111">${esc(n.c)}</span><span class="chip">${esc(n.k)}</span>${(n.n || 1) > 1 ? `<span class="chip gold">×${n.n}번 떠올림</span>` : ''}${n.p ? '<span class="chip">🔒 잠금 영역</span>' : ''}<span class="chip">${ymd(new Date(n.at))}</span></div>
<div class="card" style="--c:${color(n.c)};margin-top:12px"><span class="bd">${body(n, 5)}</span></div>
<div id="photo"></div>
<h3>연결된 생각 ${ls_.length}</h3>
<div class="list">${ls_.map(({ l, o }) => `<div class="row"><button class="pill" style="flex:1;text-align:left;border-color:${l.r === 'contra' ? 'var(--red)' : 'var(--line)'}" data-node="${o.id}">${l.r === 'contra' ? '⚡ ' : ''}${esc(o.t)}${l.why ? `<br><small style="color:var(--dim)">${esc(l.why)}</small>` : ''}</button><button class="chip ${l.r === 'contra' ? 'red' : ''}" data-act="linkType" data-id="${l.id}">${l.r === 'contra' ? '부딪힘' : '관련'}</button><button class="chip" data-act="linkDel" data-id="${l.id}">✕</button></div>`).join('')}</div>
<div class="btns"><button class="btn" data-act="linkAdd">＋ 연결</button></div>
<div class="btns"><button class="btn pri" data-act="organize">✨ AI 정리</button><button class="btn" data-act="persp">👥 세 관점·욕구</button><button class="btn" data-act="toPlanner">✅ 플래너로</button><button class="btn" data-act="edit">✏️ 고치기</button><label class="btn">📷 사진<input type="file" accept="image/*" id="photoIn" hidden></label><button class="btn" data-act="togglePrivate">${n.p ? '🔓 잠금 해제' : '🔒 잠금 영역으로'}</button><button class="btn red" data-act="del">지우기</button></div>
${(n.todo || []).length ? `<h3>플래너로 보낸 일</h3>${n.todo.map(t => `<p class="raw">${ymd(new Date(t.at))} · ${esc(t.title)}</p>`).join('')}` : ''}`);
  if (n.ph) {
    let ph = S.items.get('ph_' + id);
    if (!ph && sb) { const { data } = await sb.from('think_items').select('id,kind,data,updated_at,deleted').eq('id', 'ph_' + id).maybeSingle(); if (data && !data.deleted) { ph = fromRow(data); S.items.set(ph.id, ph); } }
    if (ph?.img && S.sel === id && $('#photo')) $('#photo').innerHTML = `<img class="photo" src="${ph.img}" alt="">`;
  }
}
function editNode(id) {
  const n = node(id), cats = [...new Set(all('node').map(x => x.c))], grps = [...new Set(all('node').map(x => x.g))];
  sheet(`<h2>고치기</h2>
<label class="f">핵심 단어<input id="e_w" value="${esc(n.w || '')}" maxlength="12"></label>
<label class="f">한 줄<input id="e_t" value="${esc(n.t)}" maxlength="140"></label>
<label class="f">요약<textarea id="e_s">${esc(n.s || '')}</textarea></label>
<label class="f">상세<textarea id="e_d">${esc(n.d || '')}</textarea></label>
<div class="row"><label class="f" style="flex:1">대분류<input id="e_c" list="dl_c" value="${esc(n.c)}"><datalist id="dl_c">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
<label class="f" style="flex:1">연결 주제<input id="e_g" list="dl_g" value="${esc(n.g)}"><datalist id="dl_g">${grps.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label></div>
<div class="row"><label class="f" style="flex:1">종류<select id="e_k">${Object.keys(KINDS).map(k => `<option ${k === n.k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
<label class="f" style="flex:1">단계<select id="e_st">${STAGES.map((s, i) => `<option value="${i}" ${i === (n.st || 0) ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div>
<label class="f">사람들 욕구 (쉼표로 구분: ${NEEDS.join('·')})<input id="e_needs" value="${esc((n.needs || []).join(', '))}"></label>
<label class="f">다음 한 걸음<input id="e_next" value="${esc(n.next || '')}"></label>
<div class="btns"><button class="btn pri" data-act="save">저장</button><button class="btn" data-act="back">취소</button></div>`);
}
function saveNode(id) {
  const n = node(id), v = k => $('#e_' + k).value.trim();
  if (v('t') !== n.t || v('s') !== (n.s || '')) (n.hist ||= []).push({ at: Date.now(), t: n.t, s: n.s });
  Object.assign(n, { w: v('w'), t: v('t') || n.t, s: v('s'), d: v('d'), c: v('c') || '미분류', g: v('g') || '새 생각', k: v('k'), st: +v('st'), needs: v('needs').split(/[,·\s]+/).filter(x => NEEDS.includes(x)), next: v('next') });
  put(n); openNode(id);
}

function openSearch(pick) {
  S.pick = pick || null;
  sheet(`<h2>${pick ? '연결할 생각 고르기' : '찾기'}</h2><input class="in" id="q" placeholder="단어로 찾기" autocomplete="off">
${pick ? '' : '<div class="btns"><button class="btn pri" data-act="askQ">이 문장으로 AI에게 묻기</button></div>'}<div id="ans"></div><div class="list" id="res" style="margin-top:12px"></div>`);
  const run = () => {
    const q = $('#q').value.trim().toLowerCase();
    const hit = nodes().filter(n => n.id !== pick && (!q || [n.t, n.s, n.w, n.c, n.g, n.raw, n.d].join(' ').toLowerCase().includes(q))).sort(byNew).slice(0, 40);
    $('#res').innerHTML = hit.map(n => pick ? `<button class="card" style="--c:${color(n.c)}" data-pick="${n.id}"><span class="bd"><b>${esc(n.t)}</b></span></button>` : card(n, Math.max(2, S.depth))).join('') || '<p class="empty">찾은 생각이 없어요.</p>';
  };
  $('#q').oninput = run; run(); setTimeout(() => $('#q')?.focus(), 50);
}
async function ask(q) {
  if (!q) return toast('물어볼 문장을 적어 주세요');
  const r = await busy('내 생각들을 읽는 중', () => gem(`아래는 한 사람의 생각 노트 목록(id|한 줄|요약)이다. 이 목록만 근거로 질문에 답하라. 목록에 없으면 없다고 말하라. 한국어 존댓말. JSON으로만: {"answer":"답 3~6문장","ids":["근거가 된 생각 id 최대 6개"]}

[질문] ${q}

[목록]
${corpus()}`));
  if (!r || !$('#ans')) return;
  $('#ans').innerHTML = `<div class="box ans">${esc(r.answer)}</div>`;
  $('#res').innerHTML = (r.ids || []).map(node).filter(vis).map(n => card(n, 3)).join('');
}

function openMantra() {
  const cand = [...new Set([...nodes().filter(n => (n.n || 1) > 1).sort((a, b) => b.n - a.n), ...nodes().filter(n => n.k === '의견').sort(byNew)].slice(0, 8).map(n => n.t))];
  sheet(`<h2>오늘의 만트라</h2><p style="color:var(--dim);margin-top:0">내가 한 말 중에서 고르거나 직접 적습니다.</p>
<div class="list" id="mlist">${cand.map(t => `<button class="card" data-mantra="${esc(t)}"><span class="bd"><b>${esc(t)}</b></span></button>`).join('')}</div>
<label class="f">직접 적기<input id="m_in" value="${esc(settings().mantra || '')}" maxlength="80"></label>
<div class="btns"><button class="btn pri" data-act="mantraSave">이 문장으로</button><button class="btn" data-act="mantraAi">AI 후보 받기</button></div>`);
}
async function mantraAi() {
  const r = await busy('만트라 후보를 뽑는 중', () => gem(`아래는 한 사람이 직접 한 생각들이다. 이 사람이 매일 되뇔 만한 만트라 후보 5개를 그 사람의 말투와 내용에서 뽑아라. 각 30자 이내, 지어내지 말고 생각에 근거. JSON으로만: {"list":["...","..."]}

${nodes().filter(n => n.k !== '자료').sort((a, b) => (b.n || 1) - (a.n || 1) || byNew(a, b)).slice(0, 60).map(n => `- ${n.t}${(n.n || 1) > 1 ? ` (×${n.n})` : ''}`).join('\n')}`));
  if (r?.list && $('#mlist')) $('#mlist').innerHTML = r.list.map(t => `<button class="card" style="--c:var(--acc)" data-mantra="${esc(t)}"><span class="bd"><b>${esc(t)}</b></span></button>`).join('');
}
const setMantra = t => { const s = settings(); s.mantra = t.trim(); put(s); closeSheet(); toast('만트라를 바꿨어요'); };

// ── 설정 ─────────────────────────────────────────────────────────────
function openSettings() {
  const s = settings();
  sheet(`<h2>설정</h2>
<div class="box" style="margin-top:0"><b>${esc(S.user.email || '')}</b><div class="btns"><button class="btn" data-act="logout">로그아웃</button><a class="btn" href="${CFG.planner}">플래너 열기</a><a class="btn" href="${CFG.quest}">한 달 퀘스트</a></div><p class="raw" style="margin-bottom:0">자판기·플래너와 로그인을 함께 씁니다. 여기서 로그아웃하면 그쪽도 로그아웃됩니다.</p></div>
<h3>AI (Gemini)</h3><div class="box" style="margin-top:0"><label class="f" style="margin-top:0">Gemini API 키 — aistudio.google.com 에서 무료로 받습니다<input id="s_gkey" type="password" value="${esc(s.gkey || '')}" placeholder="AIza…"></label><label class="f">모델 이름<input id="s_gmodel" value="${esc(s.gmodel || 'gemini-flash-latest')}"></label><div class="btns"><button class="btn pri" data-act="aiSave">저장</button></div><p class="raw" style="margin-bottom:0">AI는 버튼을 누를 때만 부릅니다. 잠금 영역의 생각은 잠금을 연 상태에서만 AI에 보냅니다.</p></div>
<h3>알림</h3><div id="notis">${notisHtml(s)}</div>
<div class="btns"><button class="btn" data-act="notiAdd">＋ 알림 추가</button><button class="btn pri" data-act="pushOn">이 기기에서 알림 켜기</button><button class="btn" data-act="pushTest">테스트</button><button class="btn" data-act="pushOff">이 기기 끄기</button></div>
<h3>잠금 영역</h3><div class="box" style="margin-top:0"><p style="margin:0">가족·건강처럼 사적인 생각은 🔒를 눌러야 보입니다. ${s.pin ? '비밀번호가 걸려 있습니다.' : '비밀번호는 없습니다.'}</p><div class="btns"><button class="btn" data-act="pinSet">${s.pin ? '비밀번호 바꾸기' : '비밀번호 걸기'}</button>${s.pin ? '<button class="btn" data-act="pinClear">비밀번호 없애기</button>' : ''}</div></div>
<h3>기록</h3><div class="btns"><button class="btn" data-act="export">전체 내보내기 (JSON)</button></div>
<p class="raw">폰에 설치: 안드로이드 Chrome 메뉴 → 앱 설치 · 아이폰 Safari 공유 → 홈 화면에 추가. 알림은 설치한 앱에서 켭니다.</p>`);
}
const notisHtml = s => (s.notis || []).map((n, i) => `<div class="noti"><div class="row"><input type="checkbox" data-noti="${i}" data-k="on" ${n.on !== false ? 'checked' : ''}><select data-noti="${i}" data-k="kind">${Object.entries(NOTI).map(([k, v]) => `<option value="${k}" ${k === n.kind ? 'selected' : ''}>${v}</option>`).join('')}</select><input type="time" step="300" data-noti="${i}" data-k="time" value="${esc(n.time)}"><button class="chip" data-act="notiDel" data-id="${i}" style="margin-left:auto">삭제</button></div><div class="days">${'월화수목금토일'.split('').map((d, j) => `<button data-day="${i}:${j + 1}" class="${(n.days || []).includes(j + 1) ? 'on' : ''}">${d}</button>`).join('')}</div></div>`).join('') || '<p class="empty">알림이 없습니다.</p>';
function notiChange(fn) { const s = settings(); s.notis ||= []; fn(s.notis); put(s, true); if ($('#notis')) $('#notis').innerHTML = notisHtml(s); }
const round5 = t => { const [h, m] = t.split(':').map(Number); return `${String(h).padStart(2, '0')}:${String(Math.floor(m / 5) * 5).padStart(2, '0')}`; };

const b64ToU8 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
async function pushOn() {
  if (!sb) return toast('지금은 켤 수 없어요');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return toast('이 브라우저는 알림을 지원하지 않아요. 홈 화면에 설치한 뒤 다시 눌러 주세요.');
  if (await Notification.requestPermission() !== 'granted') return toast('알림 권한이 꺼져 있어요');
  const reg = await navigator.serviceWorker.ready;
  const { data: key, error } = await sb.rpc('planner_vapid_public');
  if (error || !key) return toast('알림 열쇠를 받지 못했어요');
  const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) });
  const j = sub.toJSON();
  const { error: e2 } = await sb.from('think_push_subs').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_id: S.user.id });
  toast(e2 ? '알림 등록에 실패했어요' : '이 기기에서 알림을 켰어요');
}
async function pushOff() {
  const reg = await navigator.serviceWorker?.getRegistration(), sub = reg && await reg.pushManager.getSubscription();
  if (sub) { if (sb) await sb.from('think_push_subs').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
  toast('이 기기의 알림을 껐어요');
}
const sha = async t => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('tfm:' + t))), b => b.toString(16).padStart(2, '0')).join('');
async function toggleLock() {
  if (S.unlocked) { S.unlocked = false; G.pos.clear(); return render(); }
  const s = settings();
  if (s.pin) { const p = prompt('잠금 영역 비밀번호'); if (p == null) return; if (await sha(p) !== s.pin) return toast('비밀번호가 달라요'); }
  S.unlocked = true; render(); toast('잠금 영역을 열었어요. 🔓을 다시 누르면 닫힙니다.');
}
async function toPlanner(id) {
  const n = node(id), title = prompt('플래너 할 일로 보낼 문장', n.next || n.t); if (!title) return;
  const tid = newId() + newId().slice(0, 4);
  if (sb) {
    const { error } = await sb.from('planner_items').upsert({ user_id: S.user.id, id: tid, kind: 'task', updated_at: Date.now(), deleted: false, rev: 0,
      data: { title: title.slice(0, 300), cat: 0, tags: ['생각'], who: '', due: '', note: 'thinkingForMe: ' + n.t, st: 'open', at: Date.now(), doneAt: null } }, { onConflict: 'user_id,id' });
    if (error) return toast('플래너에 넣지 못했어요');
  }
  (n.todo ||= []).push({ id: tid, title, at: Date.now() }); if ((n.st || 0) < 1) n.st = 1;
  put(n); openNode(id); toast('플래너 할 일에 넣었어요', '플래너 열기', () => location.href = CFG.planner);
}
function addPhoto(id, file) {
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    const k = Math.min(1, 900 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    put({ id: 'ph_' + id, kind: 'photo', img: c.toDataURL('image/jpeg', 0.72) }, true);
    const n = node(id); n.ph = true; put(n); openNode(id); URL.revokeObjectURL(url);
  };
  img.src = url;
}

// ── 누르기 ───────────────────────────────────────────────────────────
const ACT = {
  close: closeSheet, search: () => openSearch(), settings: openSettings, lock: toggleLock, mantra: openMantra,
  back: () => openNode(S.sel), edit: () => editNode(S.sel), save: () => saveNode(S.sel), organize: () => organize(S.sel), persp: () => perspectives(S.sel),
  toPlanner: () => toPlanner(S.sel), linkAdd: () => openSearch(S.sel), weekly, ask: () => openSearch(), askQ: () => ask($('#q').value.trim()),
  mantraSave: () => setMantra($('#m_in').value), mantraAi,
  togglePrivate: () => { const n = node(S.sel); n.p = !n.p; put(n); if (n.p && !S.unlocked) { closeSheet(); toast('잠금 영역으로 옮겼어요'); } else openNode(S.sel); },
  del: () => { if (!confirm('이 생각을 지울까요?')) return; const n = node(S.sel); n.deleted = true; put(n); all('link').filter(l => l.a === n.id || l.b === n.id).forEach(l => { l.deleted = true; put(l, true); }); G.pos.delete(n.id); closeSheet(); render(); },
  linkType: el => { const l = S.items.get(el.dataset.id); l.r = l.r === 'contra' ? 'rel' : 'contra'; l.by = 'me'; put(l); openNode(S.sel); },
  linkDel: el => { const l = S.items.get(el.dataset.id); l.deleted = true; put(l); openNode(S.sel); },
  replay: () => { G.replay = { i: 0 }; G.run(); }, replayGo: () => { go('graph'); G.fit(); G.replay = { i: 0 }; G.run(); }, fit: () => G.fit(),
  aiSave: () => { const s = settings(); s.gkey = $('#s_gkey').value.trim(); s.gmodel = $('#s_gmodel').value.trim() || 'gemini-flash-latest'; put(s, true); toast('저장했어요'); },
  notiAdd: () => notiChange(a => a.push({ id: newId().slice(0, 6), kind: 'nudge', time: '18:00', days: [1, 2, 3, 4, 5, 6, 7], on: true })),
  notiDel: el => notiChange(a => a.splice(+el.dataset.id, 1)),
  pushOn, pushOff, pushTest: async () => { if (!sb) return; const { data, error } = await sb.rpc('think_push_test'); toast(error ? '보내지 못했어요' : data ? '알림을 보냈어요' : '알림을 켠 기기가 없어요'); },
  pinSet: async () => { const p = prompt('새 비밀번호'); if (!p) return; const s = settings(); s.pin = await sha(p); put(s, true); openSettings(); },
  pinClear: () => { const s = settings(); delete s.pin; put(s, true); openSettings(); },
  logout: async () => { await flush(); if (sb) await sb.auth.signOut(); ['tfm:cache', 'tfm:q'].forEach(k => localStorage.removeItem(k)); location.reload(); },
  export: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify([...S.items.values()], null, 1)], { type: 'application/json' })); a.download = `thinkingForMe-${ymd()}.json`; a.click(); },
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-node],[data-go],[data-tog],[data-pick],[data-mantra],[data-day]'); if (!t) return;
  const d = t.dataset;
  if (d.act) return ACT[d.act]?.(t);
  if (d.go) return go(d.go);
  if (d.node) return openNode(d.node);
  if (d.pick) { addLink(S.pick, d.pick); const id = S.pick; S.pick = null; return openNode(id); }
  if (d.mantra) return setMantra(d.mantra);
  if (d.day) { const [i, j] = d.day.split(':').map(Number); return notiChange(a => { const ds = new Set(a[i].days || []); ds.has(j) ? ds.delete(j) : ds.add(j); a[i].days = [...ds].sort(); }); }
  if (d.tog) { const k = d.tog, shown = S.open.has(k) ? !S.open.has('!' + k) : (S.depth >= +d.lvl && !S.open.has('!' + k)); if (shown) { S.open.add('!' + k); S.open.delete(k); } else { S.open.add(k); S.open.delete('!' + k); } ls.set('tfm:open', JSON.stringify([...S.open])); render(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.noti != null) notiChange(a => { const n = a[+t.dataset.noti]; n[t.dataset.k] = t.dataset.k === 'on' ? t.checked : t.dataset.k === 'time' ? round5(t.value || '09:00') : t.value; });
  if (t.id === 'photoIn' && t.files[0]) addPhoto(S.sel, t.files[0]);
});
$('#depth').addEventListener('input', e => { S.depth = +e.target.value; ls.set('tfm:depth', S.depth); S.open.clear(); ls.set('tfm:open', '[]'); render(); if (S.view === 'graph') G.draw(); });
$('#quick').addEventListener('submit', e => { e.preventDefault(); const i = $('#quickIn'); addThought(i.value); i.value = ''; });
addEventListener('hashchange', () => { const v = location.hash.slice(1); if (['home', 'graph', 'map', 'time', 'review'].includes(v) && v !== S.view) go(v); });
addEventListener('online', flush);
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

// ── 시작: 로그인 → 내 계정 확인 → 불러오기 ────────────────────────────
function gate(html) { $('#app').hidden = true; $('#gate').hidden = false; $('#gate').innerHTML = `<i class="logo"></i><h1>thinkingForMe</h1>${html}`; }
async function start(user) {
  S.user = user;
  try { JSON.parse(ls.get('tfm:cache') || '[]').forEach(i => S.items.set(i.id, i)); } catch { /* 저장본 없음 */ }
  $('#gate').hidden = true; $('#app').hidden = false;
  const v = location.hash.slice(1); if (['graph', 'map', 'time', 'review'].includes(v)) S.view = v;
  G.init(); render();
  try { await pull(); } catch (e) { console.warn(e); toast('서버에서 불러오지 못했어요. 저장해 둔 것을 보여 드립니다.'); }
  if (Date.now() - +(ls.get('tfm:lastOpen') || 0) > 30 * 60e3) { ls.set('tfm:lastOpen', Date.now()); bump(); }
  render(); flush();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - +(ls.get('tfm:lastOpen') || 0) > 30 * 60e3) { ls.set('tfm:lastOpen', Date.now()); bump(); pull().then(render).catch(() => {}); } });
}
async function boot() {
  if ('serviceWorker' in navigator && !TEST) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (TEST) return start(TEST.user);
  gate('<p>불러오는 중…</p>');
  try {
    await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js'; s.crossOrigin = 'anonymous'; s.onload = ok; s.onerror = no; document.head.append(s); });
    sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } });
  } catch { return gate('<p>로그인 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</p><button class="btn pri" onclick="location.reload()">다시 시도</button>'); }
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) {
    gate('<p>내 생각·의견·사업구상을 심플부터 세세하게까지</p><button class="btn pri" id="loginBtn">Google로 로그인</button>');
    $('#loginBtn').onclick = () => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
    return;
  }
  const { data: ok } = await sb.rpc('think_is_owner');
  if (!ok) {
    gate(`<p>${esc(user.email)} 계정은 이 사이트에 허용되지 않았어요.</p><button class="btn" id="outBtn">다른 계정으로 로그인</button>`);
    $('#outBtn').onclick = async () => { await sb.auth.signOut(); location.reload(); };
    return;
  }
  start({ id: user.id, email: user.email });
}
boot();
