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
  B.relKey = '';
  toast('생각을 적었습니다', settings().gkey ? 'AI로 정리' : '열어 보기', () => settings().gkey ? organize(n.id) : openNode(n.id));
}

// ── AI (Gemini) — 버튼을 누를 때만 부릅니다 ────────────────────────────
async function gem(prompt) {
  const s = settings();
  if (!s.gkey) { toast('AI를 쓰려면 설정에 Gemini 키를 먼저 넣어 주세요', '설정 열기', openSettings); throw new Error('nokey'); }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.gmodel || 'gemini-flash-latest')}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.gkey },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } }),
  });
  if (!res.ok) throw new Error(res.status === 429 ? '무료 한도를 넘었습니다. 잠시 뒤 다시 눌러 주세요.' : `AI 오류 (${res.status})`);
  const j = await res.json();
  const txt = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  return JSON.parse(txt.replace(/^```json\s*|```\s*$/g, ''));
}
async function busy(label, fn) {
  const t = toast(label, null, null, 60000);
  try { return await fn(); } catch (e) { if (e.message !== 'nokey') toast(e.message || 'AI가 답하지 못했습니다. 다시 눌러 주세요.'); console.warn(e); }
  finally { t.remove(); }
}
const groupsText = () => [...new Set(all('node').map(n => `${n.c} > ${n.g}`))].join('\n');

async function organize(id) {
  const n = node(id); if (!n) return;
  const cand = nearest(n.raw || n.t, 25, id).map(([, m]) => `${m.id}|${m.t}`).join('\n');
  const r = await busy('AI가 정리하는 중입니다', () => gem(`너는 한 사람의 생각 노트를 정리하는 조수다. 아래 "새 생각"을 정리해 JSON 하나로만 답하라. 한국어. 사용자가 하지 않은 말을 지어내지 말 것.
형식: {"w":"핵심 단어 1개(6자 이내)","t":"한 줄(40자 이내)","s":"요약 1~2문장","d":"상세 3~5문장(생각의 배경·의미·열린 질문)","c":"대분류","g":"연결 주제","k":"생각|의견|구상|자료|기록 중 하나","needs":["${NEEDS.join('","')}" 중 이 생각이 건드리는 사람들의 욕구 0~3개],"next":"다음 한 걸음(구상일 때만, 20자 이내, 없으면 빈 문자열)","kw":"이 생각을 나타낼 사진 검색어(영어 1~2단어, 구체적인 사물이나 장면)","links":[{"id":"관련 생각 id","r":"rel 또는 contra(서로 부딪히면)","why":"한 줄 이유"}]}
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
    c: String(r.c || n.c), g: String(r.g || n.g), k: KINDS[r.k] ? r.k : n.k, needs: (r.needs || []).filter(x => NEEDS.includes(x)), next: String(r.next || ''), kw: String(r.kw || n.kw || ''), ai: Date.now(),
  });
  for (const l of r.links || []) if (node(l.id) && l.id !== id) addLink(id, l.id, l.r === 'contra' ? 'contra' : 'rel', l.why, 'ai');
  if (!pic(n) && n.kw) try { const im = (await commons(n.kw, 3))[0]; if (im) { n.img = im.th; n.imgSrc = im.page; } } catch { /* 그림은 없어도 됨 */ }
  B.relKey = ''; put(n); openNode(id);
  toast('정리했습니다. 틀린 연결은 눌러서 고칠 수 있습니다.');
}
async function perspectives(id) {
  const n = node(id); if (!n) return;
  const r = await busy('세 사람의 눈으로 보는 중입니다', () => gem(`아래 구상을 세 관점에서 냉정하게 평가해 JSON으로만 답하라. 한국어, 각 항목 1~2문장.
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
// 대분류마다 포스트잇 색 한 쌍 [바탕, 글자]
const PAL = [['#FFE9A8', '#5A4200'], ['#CFE4FF', '#0D3B73'], ['#D3F1D8', '#165A2B'], ['#FFD9D0', '#7C2414'], ['#E6DBFF', '#42248A'], ['#FFDDEE', '#7B1648'], ['#D4EEEA', '#0F4F48'], ['#E9E6DD', '#44403A']];
const pal = c => PAL[hue(c) % PAL.length];
const fmtDay = t => { const d = new Date(t); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
const pic = n => n.th || n.img || '';
const thumb = n => pic(n)
  ? `<img class="th" src="${esc(pic(n))}" alt="" loading="lazy" referrerpolicy="no-referrer">`
  : `<span class="th tile" style="background:${pal(n.c)[0]};color:${pal(n.c)[1]}">${esc((n.w || n.t).slice(0, 5))}</span>`;
const views = v => `<div class="view3">${v.inv ? `<div><b>투자자의 눈</b>${esc(v.inv)}</div>` : ''}${v.cus ? `<div><b>고객의 눈</b>${esc(v.cus)}</div>` : ''}${v.com ? `<div><b>경쟁자의 눈</b>${esc(v.com)}</div>` : ''}${v.need ? `<div><b>사람들의 욕구 (AI 추정)</b>${esc(v.need)}</div>` : ''}</div>`;
function body(n, d = S.depth) {
  if (d <= 1) return `<b class="w">${esc(n.w || n.t.split(' ')[0])}</b>`;
  let o = `<b>${esc(n.t)}</b>`;
  if (d >= 3 && n.s) o += `<p>${esc(n.s)}</p>`;
  if (d >= 4) {
    if (n.d) o += `<p>${esc(n.d)}</p>`;
    if ((n.needs || []).length || n.next) o += `<div class="chips">${(n.needs || []).map(x => `<span class="chip need">${esc(x)}</span>`).join('')}${n.next ? `<span class="chip">다음 걸음: ${esc(n.next)}</span>` : ''}</div>`;
    if (n.v) o += views(n.v);
  }
  if (d >= 5) {
    if (n.raw && n.raw !== n.s) o += `<p class="raw">“${esc(n.raw)}”</p>`;
    for (const x of n.hist || []) o += `<p class="raw">${fmtDay(x.at)}, ${x.again ? '다시 떠올림: ' + esc(x.again) : '고치기 전: ' + esc(x.t || '') + (x.s ? ' / ' + esc(x.s) : '')}</p>`;
  }
  return o;
}
const card = (n, d = S.depth) => `<button class="item" data-node="${n.id}">${thumb(n)}<span class="rb">${body(n, d)}<span class="meta"><span>${esc(n.k)}</span><span>${esc(n.c)}</span><span>${fmtDay(n.at)}</span>${n.p ? '<span>잠금 영역</span>' : ''}${(n.n || 1) > 1 ? `<mark>${n.n}번 떠올림</mark>` : ''}</span></span></button>`;
const byNew = (a, b) => (b.at || 0) - (a.at || 0);
const moved = (n, since) => n.at > since || (n.last || 0) > since;

function viewHome() {
  const ns = nodes(), s = settings(), used = useOf(ymd()), wk = Date.now() - 7 * DAY, st = streak();
  const src = s.mantraFrom && node(s.mantraFrom), now = new Date();
  const ideas = ns.filter(n => n.k === '구상').sort((a, b) => (b.st || 0) - (a.st || 0) || byNew(a, b)).slice(0, 7);
  const rep = ns.filter(n => (n.n || 1) > 1).sort((a, b) => b.n - a.n).slice(0, 5);
  const contra = links().filter(l => l.r === 'contra');
  return `<p class="date">${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${'일월화수목금토'[now.getDay()]}요일</p>
<h1 class="mantra"><span>${esc(s.mantra || '오늘 되뇔 한 문장을 골라 보세요')}</span></h1>
<p class="by">${src ? `${fmtDay(src.at)}에 내가 적은 말` : '내가 고른 문장'}<button data-act="mantra">바꾸기</button></p>
<p class="brief">생각 <b>${ns.length}개</b>가 쌓였고, 지난 7일 동안 <b>${ns.filter(n => moved(n, wk)).length}개</b>가 움직였습니다. 오늘은 <b>${used}번</b> 열었습니다 <span class="ticks">${[0, 1, 2, 3, 4].map(i => `<i class="${i < used ? 'fill' : ''}"></i>`).join('')}</span> ${used >= 5 ? '하루 다섯 번을 채웠습니다.' : `다섯 번까지 ${5 - used}번 남았습니다.`}${st > 1 ? ` ${st}일째 이어 쓰고 있습니다.` : ''}</p>
${ideas.length ? `<h2>실행을 기다리는 구상<small>${ns.filter(n => n.k === '구상').length}개 중 앞선 순서</small></h2>${ideas.map(n => `<button class="idea" data-node="${n.id}">${thumb(n)}<span><b>${esc(S.depth <= 1 ? n.w || n.t : n.t)}</b>${S.depth >= 2 ? `<span>${n.next ? '다음 걸음: ' + esc(n.next) : (n.needs || []).length ? '건드리는 욕구: ' + esc(n.needs.join(', ')) : esc(n.g)}</span>` : ''}</span><span class="stage s${n.st || 0}">${STAGES[n.st || 0]}</span></button>`).join('')}` : ''}
${contra.length ? `<h2>서로 부딪히는 생각</h2>${contra.map(l => `<div class="pair"><div><button data-node="${l.a}">${esc(node(l.a).w || node(l.a).t)}</button><i></i><button data-node="${l.b}">${esc(node(l.b).w || node(l.b).t)}</button></div>${S.depth > 1 && l.why ? `<p>${esc(l.why)}</p>` : ''}</div>`).join('')}` : ''}
${rep.length ? `<h2>자주 돌아오는 생각</h2>${rep.map(n => card(n)).join('')}` : ''}
<h2>최근에 적은 생각</h2>
${ns.length ? `<div class="pgrid">${[...ns].sort(byNew).slice(0, 8).map(n => `<button class="pcard" data-node="${n.id}">${thumb(n)}<b>${esc(S.depth <= 1 ? n.w || n.t : n.t)}</b><span class="meta"><span>${esc(n.c)}</span><span>${fmtDay(n.at)}</span></span></button>`).join('')}</div>` : '<p class="empty">아래 칸에 첫 생각을 한 줄 적어 보세요.</p>'}`;
}

function viewTime() {
  const ns = nodes().sort(byNew), d = S.depth, by = new Map();
  for (const n of ns) { const t = new Date(n.at), k = d <= 1 ? `${t.getFullYear()}년 ${t.getMonth() + 1}월` : `${t.getFullYear()}년 ${fmtDay(n.at)}`; if (!by.has(k)) by.set(k, []); by.get(k).push(n); }
  return `<div class="tl">${[...by].map(([k, list]) => `<h2>${k}<small>${list.length}개</small></h2>${d <= 1
    ? `<div class="words" style="margin-top:10px">${list.map(n => `<button style="background:${pal(n.c)[0]};color:${pal(n.c)[1]}" data-node="${n.id}">${esc(n.w || n.t)}</button>`).join('')}</div>`
    : list.map(n => card(n)).join('')}`).join('') || '<p class="empty">아직 적은 생각이 없습니다.</p>'}</div>`;
}

const weekKey = (d = new Date()) => { const t = new Date(d); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return ymd(t); };
function viewReview() {
  const ns = nodes(), wk = Date.now() - 7 * DAY, week = ns.filter(n => moved(n, wk));
  const days = [...Array(14)].map((_, i) => ymd(new Date(Date.now() - (13 - i) * DAY)));
  const max = Math.max(6, ...days.map(useOf)), full = days.filter(x => useOf(x) >= 5).length;
  const cats = new Map(); ns.forEach(n => cats.set(n.c, (cats.get(n.c) || 0) + 1));
  const top = [...cats].sort((a, b) => b[1] - a[1]), cmax = top[0]?.[1] || 1;
  const sorted = [...ns].sort((a, b) => a.at - b.at), W = 320, H = 90;
  const t0 = sorted[0]?.at || 0, t1 = Math.max(Date.now(), t0 + 1);
  const pts = sorted.map((n, i) => `${((n.at - t0) / (t1 - t0) * W).toFixed(1)},${(H - (i + 1) / sorted.length * (H - 8)).toFixed(1)}`).join(' ');
  const wg = new Map(); week.forEach(n => wg.set(n.g, (wg.get(n.g) || 0) + 1));
  const revs = all('review').sort((a, b) => b.id.localeCompare(a.id));
  return `<h1 class="mantra" style="font-size:clamp(22px,5.6vw,34px)">${ns.length}개가 쌓였고, 가장 큰 덩어리는 ${esc(top[0]?.[0] || '아직 없음')}입니다.</h1>
<h2>생각이 쌓여 온 모습<small>${sorted[0] ? fmtDay(t0) + '부터 오늘까지' : ''}</small></h2>
<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;margin-top:12px;border-bottom:1px solid var(--ink)"><polyline points="0,${H} ${pts} ${W},8" fill="none" stroke="#2447D6" stroke-width="2"/></svg>
<div class="btns"><button class="btn" data-act="replayGo">쌓여 온 순서대로 다시 보기</button></div>
<h2>최근 14일 동안 연 횟수<small>점선이 하루 다섯 번, 채운 날 ${full}일</small></h2>
<div class="bars" style="--goal:${5 / max * 100}%">${days.map(x => `<div class="${useOf(x) >= 5 ? 'ok' : ''}" style="height:${useOf(x) / max * 100}%" title="${x}, ${useOf(x)}번"></div>`).join('')}</div>
<h2>생각이 몰려 있는 곳</h2>
${top.map(([c, n]) => `<div class="hb"><span>${esc(c)}</span><i style="background:${pal(c)[1]};width:${n / cmax * 100}%"></i><span>${n}</span></div>`).join('')}
<h2>이번 주 돌아보기</h2>
<p class="brief" style="margin-top:12px;font-size:16px">${week.length ? `지난 7일 동안 <b>${week.length}개</b>의 생각이 움직였습니다. 가장 오래 머문 주제는 ${[...wg].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g, n]) => `${esc(g)}(${n})`).join(', ')}입니다.` : '지난 7일 동안 움직인 생각이 없습니다. 아래 칸에 한 줄을 적으면 여기에 나타납니다.'}</p>
<div class="btns"><button class="btn pri" data-act="weekly">AI로 회고 쓰기</button><button class="btn" data-act="search">내 생각에 질문하기</button></div>
${revs.map(r => `<h3>${fmtDay(new Date(r.id.slice(4)).getTime())} 주</h3><div class="ans">${esc(r.text)}</div>`).join('')}`;
}
async function weekly() {
  const wk = Date.now() - 7 * DAY, week = nodes().filter(n => moved(n, wk));
  if (!week.length) return toast('지난 7일 동안 움직인 생각이 없습니다');
  const r = await busy('이번 주를 돌아보는 중입니다', () => gem(`한 사람이 이번 주에 적은 생각 목록이다. 주간 회고를 JSON으로만 답하라. 한국어, 존댓말. 지어내지 말고 목록에 있는 내용만 근거로.
형식: {"text":"회고 본문. 첫 문단: 이번 주 생각이 흐른 방향 2~3문장. 둘째 문단: 반복되거나 서로 부딪힌 생각. 셋째 문단: 다음 주에 실행으로 옮길 만한 한 가지. 문단은 빈 줄로 구분."}

${week.map(n => `- [${n.k}] ${n.t} : ${(n.s || '').slice(0, 120)}${(n.n || 1) > 1 ? ` (${n.n}번)` : ''}`).join('\n')}`));
  if (r?.text) put({ id: 'rev:' + weekKey(), kind: 'review', text: String(r.text), at: Date.now() });
}

// ── 보드: 지도(가지)와 연결 — 끌어서 옮기고 벌려서 확대하는 작업판 ─────
const B = { k: 1, tx: 0, ty: 0, drag: 0, rel: false, items: [], fitKey: '', ptr: new Map(), pinch: 0, relKey: '', relOut: null };
const isOpen = (key, lvl) => S.open.has(key) ? true : (S.depth >= lvl && !S.open.has('!' + key));
const leafHtml = (n, d) => {
  const [bg, fg] = pal(n.c), hot = (n.n || 1) > 1 ? ' hot' : '', st = `background:${bg};color:${fg}`;
  if (d <= 2) return [`leaf d2${hot}`, st, `<b>${esc(n.t)}</b>`];
  if (d === 3) return [`leaf d3${hot}`, st, `${thumb(n)}<div><b>${esc(n.t)}</b>${n.s ? `<span>${esc(n.s)}</span>` : ''}</div>`];
  return [`leaf d4${hot}`, st, `${thumb(n)}<div><b>${esc(n.t)}</b>${n.s ? `<span>${esc(n.s)}</span>` : ''}</div>`];
};
function treeItems() {
  const ns = nodes(), d = S.depth, tree = new Map();
  for (const n of ns) { if (!tree.has(n.c)) tree.set(n.c, new Map()); const g = tree.get(n.c); if (!g.has(n.g)) g.set(n.g, []); g.get(n.g).push(n); }
  const LH = d <= 2 ? 40 : d === 3 ? 96 : 176, LW = d <= 2 ? 250 : 280, GAP = 10, CW = 176, GW = 210;
  const X = [135, 135 + CW + 56, 135 + CW + 56 + GW + 56];   // 대분류, 주제, 생각 열이 시작하는 곳(가운데에서의 거리)
  const items = [{ x: -80, y: -28, w: 160, h: 56, cls: 'root', html: `나의 생각<small>${ns.length}</small>` }], wires = [], at = new Map();
  const cats = [...tree].map(([c, gs]) => {
    const open = isOpen('c:' + c, 2);
    const h = !open ? 48 : [...gs].reduce((s, [g, l]) => s + (isOpen('g:' + c + '>' + g, 3) ? l.length * (LH + GAP) - GAP : 42) + GAP, -GAP);
    return { c, gs, open, h: Math.max(48, h), cnt: [...gs.values()].reduce((s, l) => s + l.length, 0) };
  }).sort((a, b) => b.cnt - a.cnt);
  const narrow = innerWidth < 700;   // 폰에서는 가지를 오른쪽 한쪽으로만 뻗음
  const sides = [{ dir: 1, y: 0, list: [] }, { dir: -1, y: 0, list: [] }];
  for (const c of cats) { const s = narrow || sides[0].y <= sides[1].y ? sides[0] : sides[1]; s.list.push(c); s.y += c.h + 26; }
  const wire = (a, b, dir) => { const x1 = dir > 0 ? a.x + a.w : a.x, y1 = a.y + a.h / 2, x2 = dir > 0 ? b.x : b.x + b.w, y2 = b.y + b.h / 2, m = (x1 + x2) / 2; wires.push(`<path d="M${x1} ${y1}C${m} ${y1} ${m} ${y2} ${x2} ${y2}"/>`); };
  for (const s of sides) {
    let y = -(s.y - 26) / 2;
    const px = (i, w) => s.dir > 0 ? X[i] : -(X[i] + w);
    for (const c of s.list) {
      const top = y, [, fg] = pal(c.c), ck = 'c:' + c.c, kids = [];
      if (c.open) for (const [g, list] of c.gs) {
        const gk = 'g:' + c.c + '>' + g, gtop = y, gopen = isOpen(gk, 3), leaves = [];
        if (gopen) for (const n of list.sort(byNew)) {
          const [cls, st, html] = leafHtml(n, d), it = { x: px(2, LW), y, w: LW, h: LH, cls, st, html, node: n.id };
          items.push(it); leaves.push(it); at.set(n.id, it); y += LH + GAP;
        } else y += 42 + GAP;
        const gi = { x: px(1, GW), y: (gtop + y - GAP) / 2 - 21, w: GW, h: 42, cls: 'grp', st: `border-color:${fg};color:${fg}`, html: `<span>${esc(g)}</span><small>${list.length}</small>`, tog: gk, lvl: 3 };
        items.push(gi); kids.push(gi); leaves.forEach(l => wire(gi, l, s.dir));
      } else y += 48 + GAP;
      const ci = { x: px(0, CW), y: (top + y - GAP) / 2 - 24, w: CW, h: 48, cls: 'cat', st: `background:${fg}`, html: `<span>${esc(c.c)}</span><small>${c.cnt}</small>`, tog: ck, lvl: 2 };
      items.push(ci); kids.forEach(k => wire(ci, k, s.dir)); wire(items[0], ci, s.dir);
      y += 26 - GAP;
    }
  }
  for (const l of links()) {
    if (l.r !== 'contra' && !B.rel) continue;
    const a = at.get(l.a), b = at.get(l.b); if (!a || !b) continue;
    const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2, same = Math.sign(ax) === Math.sign(bx);
    wires.push(`<path class="${l.r === 'contra' ? 'contra' : 'rel'}" d="M${ax} ${ay}Q${same ? ax + Math.sign(ax) * (a.w / 2 + 70) : 0} ${(ay + by) / 2} ${bx} ${by}"/>`);
  }
  return { items, wires };
}
function relItems() {
  const ns = nodes(), ls_ = links(), d = S.depth, key = [ns.length, ls_.length, d <= 1, S.unlocked].join();
  if (B.relKey === key && B.relOut) return B.relOut;
  const cats = [...new Set(ns.map(n => n.c))], R = Math.max(200, 34 * Math.sqrt(ns.length)), W = d <= 1 ? 104 : 190, H = d <= 1 ? 44 : 60;
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  const idx = new Map(), P = ns.map(n => { const i = cats.indexOf(n.c), a = i / cats.length * 6.283, p = { n, cx: Math.cos(a) * R, cy: Math.sin(a) * R, vx: 0, vy: 0 }; p.x = p.cx + rnd() * 120; p.y = p.cy + rnd() * 120; idx.set(n.id, p); return p; });
  const L = ls_.map(l => [idx.get(l.a), idx.get(l.b), l.r]).filter(l => l[0] && l[1]);
  for (let it = 0, a = 1; it < 260; it++, a *= 0.985) {
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      for (let j = i + 1; j < P.length; j++) { const q = P[j]; let dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy; if (d2 > 22500) continue; if (d2 < 1) { dx = rnd(); dy = rnd(); d2 = 1; } const f = a * 420 / (d2 + 60); p.vx += dx * f; p.vy += dy * f; q.vx -= dx * f; q.vy -= dy * f; }
      p.vx += (p.cx - p.x) * 0.02 * a; p.vy += (p.cy - p.y) * 0.02 * a;
    }
    for (const [p, q] of L) { const dx = q.x - p.x, dy = q.y - p.y, dd = Math.hypot(dx, dy) || 1, f = (dd - 70) * 0.012 * a / dd; p.vx += dx * f; p.vy += dy * f; q.vx -= dx * f; q.vy -= dy * f; }
    for (const p of P) { p.vx *= 0.8; p.vy *= 0.8; p.x += p.vx; p.y += p.vy; }
  }
  for (const p of P) { p.x *= W / 62; p.y *= H / 46; }
  for (let it = 0; it < 60; it++) for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const p = P[i], q = P[j], ox = W + 14 - Math.abs(p.x - q.x), oy = H + 12 - Math.abs(p.y - q.y);
    if (ox <= 0 || oy <= 0) continue;
    if (ox / W < oy / H) { const s = (p.x < q.x ? -1 : 1) * ox / 2; p.x += s; q.x -= s; } else { const s = (p.y < q.y ? -1 : 1) * oy / 2; p.y += s; q.y -= s; }
  }
  const items = cats.map(c => { const m = P.filter(p => p.n.c === c); return { x: m.reduce((s, p) => s + p.x, 0) / m.length, y: Math.min(...m.map(p => p.y)) - 70, w: 0, h: 0, cls: 'lab', st: `color:${pal(c)[1]}`, html: esc(c) }; });
  for (const p of P) {
    const n = p.n, [bg, fg] = pal(n.c);
    items.push({ x: p.x - W / 2, y: p.y - H / 2, w: W, h: H, cls: 'chip' + ((n.n || 1) > 1 ? ' hot' : ''), st: `background:${bg};color:${fg}`, node: n.id, at: n.at, html: d <= 1 ? `<b>${esc(n.w || n.t)}</b>` : `${thumb(n)}<b>${esc(n.t)}</b>` });
  }
  const wires = L.map(([p, q, r]) => `<line class="${r === 'contra' ? 'contra' : ''}" x1="${p.x.toFixed(0)}" y1="${p.y.toFixed(0)}" x2="${q.x.toFixed(0)}" y2="${q.y.toFixed(0)}"/>`);
  B.relKey = key; return B.relOut = { items, wires };
}
function drawBoard(mode) {
  const { items, wires } = mode === 'map' ? treeItems() : relItems();
  B.items = items;
  $('#main').innerHTML = `<div id="bd"><div id="world"><svg id="wires">${wires.join('')}</svg>${items.map(i => `<${i.node || i.tog ? 'button' : 'div'} class="nd ${i.cls}" style="left:${i.x.toFixed(0)}px;top:${i.y.toFixed(0)}px;${i.w ? `width:${i.w}px;height:${i.h}px;` : ''}${i.st || ''}"${i.node ? ` data-node="${i.node}"` : ''}${i.tog ? ` data-tog="${esc(i.tog)}" data-lvl="${i.lvl}"` : ''}${i.at ? ` data-at="${i.at}"` : ''}>${i.html}</${i.node || i.tog ? 'button' : 'div'}>`).join('')}</div></div>
<div class="bdui"><button data-act="fit">전체 보기</button><button data-act="zout" aria-label="축소">−</button><span id="zoomPct"></span><button data-act="zin" aria-label="확대">＋</button>${mode === 'map' ? `<button data-act="relToggle" class="${B.rel ? 'on' : ''}">관련선</button>` : '<button data-act="replay">쌓인 순서로</button><span id="replayDate" hidden></span>'}</div>`;
  const bd = $('#bd');
  bd.addEventListener('pointerdown', e => { B.ptr.set(e.pointerId, [e.clientX, e.clientY]); if (B.ptr.size === 1) B.drag = 0; B.pinch = 0; });
  bd.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.12 : 0.89, e.clientX, e.clientY); }, { passive: false });
  const key = mode + (mode === 'map' ? S.depth : S.depth <= 1) + S.unlocked;
  if (B.fitKey !== key) { B.fitKey = key; fitBoard(false); } else applyT();
}
function applyT() {
  const w = $('#world'), bd = $('#bd'); if (!w) return;
  w.style.transform = `translate(${B.tx}px,${B.ty}px) scale(${B.k})`;
  const g = 26 * B.k * (B.k < 0.4 ? 4 : 1);
  bd.style.backgroundSize = `${g}px ${g}px`; bd.style.backgroundPosition = `${B.tx}px ${B.ty}px`;
  $('#zoomPct').textContent = Math.round(B.k * 100) + '%';
}
function fitBoard(all_) {
  const bd = $('#bd'); if (!bd) return;
  const W = bd.clientWidth, H = bd.clientHeight, its = B.items.filter(i => i.w);
  if (!its.length) return applyT();
  const x0 = Math.min(...its.map(i => i.x)), x1 = Math.max(...its.map(i => i.x + i.w)), y0 = Math.min(...its.map(i => i.y)), y1 = Math.max(...its.map(i => i.y + i.h));
  const k = Math.min(W / (x1 - x0 + 60), (H - 50) / (y1 - y0 + 60), 1.1);
  if (all_ || k >= 0.72) { B.k = Math.max(0.04, k); B.tx = W / 2 - (x0 + x1) / 2 * B.k; B.ty = (H + 40) / 2 - (y0 + y1) / 2 * B.k; }
  else if (S.view === 'map') { B.k = 0.85; const nar = innerWidth < 700; B.tx = nar ? 14 - 135 * B.k : W / 2; B.ty = nar ? 64 - y0 * B.k : H / 2; }   // 다 안 들어가면 읽을 수 있는 크기로, 폰은 첫 가지부터
  else { B.k = 0.8; B.tx = W / 2 - (x0 + x1) / 2 * B.k; B.ty = H / 2 - (y0 + y1) / 2 * B.k; }   // 너무 작아지면 가운데부터 읽을 수 있는 크기로
  applyT();
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
function replay() {
  const els = [...document.querySelectorAll('#world .chip')].sort((a, b) => a.dataset.at - b.dataset.at), lab = $('#replayDate');
  if (!els.length) return;
  fitBoard(true); els.forEach(e => e.classList.add('hid')); $('#wires').style.visibility = 'hidden'; lab.hidden = false;
  let i = 0; clearInterval(B.timer);
  B.timer = setInterval(() => {
    if (!els[i] || !els[i].isConnected) { clearInterval(B.timer); if ($('#wires')) { $('#wires').style.visibility = ''; lab.hidden = true; } return; }
    els[i].classList.remove('hid'); lab.textContent = `${fmtDay(+els[i].dataset.at)}, ${++i}개`;
  }, Math.max(30, 7000 / els.length));
}

// ── 화면 그리기와 뒤로가기 ────────────────────────────────────────────
// 뒤로가기는 "창 닫기 → 이전 화면 → 첫 화면" 순서로만 움직이고 사이트 밖으로 나가지 않습니다.
const NAV = [], SH = [];
function render() {
  if (!S.user) return;
  $('#depth').value = S.depth; $('#depthName').textContent = DEPTHS[S.depth];
  $('#lockBtn').textContent = S.unlocked ? '잠금 열림' : '잠금'; $('#lockBtn').classList.toggle('on', S.unlocked);
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.go === S.view));
  const board = S.view === 'map' || S.view === 'rel';
  $('#main').className = board ? 'board' : '';
  if (board) return drawBoard(S.view);
  const top = $('#main').scrollTop;
  $('#main').innerHTML = S.view === 'time' ? viewTime() : S.view === 'review' ? viewReview() : viewHome();
  $('#main').scrollTop = top;
}
const stamp = () => history.pushState({ tfm: NAV.length }, '');
function go(v) {
  if (v === S.view) return;
  if (S.view === 'home') { NAV.push('home'); stamp(); }   // 탭은 한 겹만 쌓음: 어느 탭에서든 뒤로가기 한 번이면 '오늘'
  S.view = v; render(); $('#main').scrollTop = 0;
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
    if (e === 'sheet') SH.pop(); else S.view = e;
  }
  S.pick = null;
  if (SH.length) SH[SH.length - 1](); else $('#sheet').hidden = true;
  render();
});

// ── 창(아래에서 올라오는 시트) ────────────────────────────────────────
function sheet(html) { $('#sheetBox').innerHTML = html; $('#sheet').hidden = false; $('#sheetBox').scrollTop = 0; }
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
  sheet(`${n.ph ? '<div id="photo"></div>' : n.img ? `<img class="cover" src="${esc(n.img)}" alt="" referrerpolicy="no-referrer">` : ''}
<div class="chips" style="margin-top:0"><span class="chip" style="background:${bg};color:${fg}">${esc(n.c)}</span><span class="chip">${esc(n.g)}</span><span class="chip">${esc(n.k)}</span><span class="chip">${STAGES[n.st || 0]}</span><span class="chip">${fmtDay(n.at)}</span>${(n.n || 1) > 1 ? `<span class="chip" style="background:var(--hl)">${n.n}번 떠올림</span>` : ''}${n.p ? '<span class="chip">잠금 영역</span>' : ''}</div>
<p class="ttl">${esc(n.t)}</p>
<div class="rb">${body(n, 5).replace(/^<b>.*?<\/b>/, '')}</div>
${n.url ? `<p class="hint"><a href="${esc(n.url)}" target="_blank" rel="noopener">원본 열기</a>${n.imgSrc ? ` &nbsp; <a href="${esc(n.imgSrc)}" target="_blank" rel="noopener">사진 출처</a>` : ''}</p>` : n.imgSrc ? `<p class="hint"><a href="${esc(n.imgSrc)}" target="_blank" rel="noopener">사진 출처</a></p>` : ''}
<div class="btns"><button class="btn pri" data-act="organize">AI로 정리</button><button class="btn" data-act="persp">세 관점과 욕구 보기</button><button class="btn" data-act="toPlanner">플래너로 보내기</button></div>
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
  const r = await busy('내 생각들을 읽는 중입니다', () => gem(`아래는 한 사람의 생각 노트 목록(id|한 줄|요약)이다. 이 목록만 근거로 질문에 답하라. 목록에 없으면 없다고 말하라. 한국어 존댓말. JSON으로만: {"answer":"답 3~6문장","ids":["근거가 된 생각 id 최대 6개"]}

[질문] ${q}

[목록]
${corpus()}`));
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
  const r = await busy('후보 문장을 뽑는 중입니다', () => gem(`아래는 한 사람이 직접 한 생각들이다. 이 사람이 매일 되뇔 만한 문장 후보 5개를 그 사람의 말투와 내용에서 뽑아라. 각 30자 이내, 지어내지 말고 생각에 근거. JSON으로만: {"list":["...","..."]}

${nodes().filter(n => n.k !== '자료').sort((a, b) => (b.n || 1) - (a.n || 1) || byNew(a, b)).slice(0, 60).map(n => `- ${n.t}${(n.n || 1) > 1 ? ` (${n.n}번)` : ''}`).join('\n')}`));
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
  t.remove(); B.relKey = ''; render();
  toast(fail >= 4 ? `사진 서버가 응답하지 않아 ${ok}개에서 멈췄습니다. 잠시 뒤 다시 눌러 주세요.` : `그림 ${ok}개를 붙였습니다`);
}

// ── 설정 ─────────────────────────────────────────────────────────────
const openSettings = () => show('settings', drawSettings);
function drawSettings() {
  const s = settings();
  sheet(`<h2>설정</h2>
<div><b>${esc(S.user.email || '')}</b><div class="btns"><button class="btn" data-act="logout">로그아웃</button><a class="btn" href="${CFG.vending}">자판기 열기</a><a class="btn" href="${CFG.planner}">플래너 열기</a><a class="btn" href="${CFG.quest}">한 달 퀘스트</a></div><p class="hint" style="margin-bottom:0">자판기·플래너와 로그인을 함께 씁니다. 여기서 로그아웃하면 그쪽도 로그아웃됩니다.</p></div>
<h3>AI (Gemini)</h3><div><label class="f" style="margin-top:0">Gemini API 키 — aistudio.google.com 에서 무료로 받습니다<input id="s_gkey" type="password" value="${esc(s.gkey || '')}" placeholder="AIza…"></label><label class="f">모델 이름<input id="s_gmodel" value="${esc(s.gmodel || 'gemini-flash-latest')}"></label><div class="btns"><button class="btn pri" data-act="aiSave">저장</button></div><p class="hint" style="margin-bottom:0">AI는 버튼을 누를 때만 부릅니다. 잠금 영역의 생각은 잠금을 연 상태에서만 AI에 보냅니다.</p></div>
<h3>알림</h3><div id="notis">${notisHtml(s)}</div>
<div class="btns"><button class="btn" data-act="notiAdd">＋ 알림 추가</button><button class="btn pri" data-act="pushOn">이 기기에서 알림 켜기</button><button class="btn" data-act="pushTest">테스트</button><button class="btn" data-act="pushOff">이 기기 끄기</button></div>
<h3>잠금 영역</h3><div><p style="margin:0">가족·건강처럼 사적인 생각은 위쪽 '잠금'을 눌러야 보입니다. ${s.pin ? '비밀번호가 걸려 있습니다.' : '비밀번호는 없습니다.'}</p><div class="btns"><button class="btn" data-act="pinSet">${s.pin ? '비밀번호 바꾸기' : '비밀번호 걸기'}</button>${s.pin ? '<button class="btn" data-act="pinClear">비밀번호 없애기</button>' : ''}</div></div>
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
async function toPlanner(id) {
  const n = node(id), title = prompt('플래너 할 일로 보낼 문장', n.next || n.t); if (!title) return;
  const tid = newId() + newId().slice(0, 4);
  if (sb) {
    const { error } = await sb.from('planner_items').upsert({ user_id: S.user.id, id: tid, kind: 'task', updated_at: Date.now(), deleted: false, rev: 0,
      data: { title: title.slice(0, 300), cat: 0, tags: ['생각'], who: '', due: '', note: 'thinkingForMe: ' + n.t, st: 'open', at: Date.now(), doneAt: null } }, { onConflict: 'user_id,id' });
    if (error) return toast('플래너에 넣지 못했습니다');
  }
  (n.todo ||= []).push({ id: tid, title, at: Date.now() }); if ((n.st || 0) < 1) n.st = 1;
  put(n); openNode(id); toast('플래너 할 일에 넣었습니다', '플래너 열기', () => location.href = CFG.planner);
}
function addPhoto(id, file) {
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    const k = Math.min(1, 900 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    put({ id: 'ph_' + id, kind: 'photo', img: c.toDataURL('image/jpeg', 0.72) }, true);
    const t = document.createElement('canvas'), tk = 200 / Math.min(img.width, img.height); t.width = t.height = 200;
    t.getContext('2d').drawImage(img, (200 - img.width * tk) / 2, (200 - img.height * tk) / 2, img.width * tk, img.height * tk);
    const n = node(id); n.ph = true; n.th = t.toDataURL('image/jpeg', 0.7); B.relKey = ''; put(n); openNode(id); URL.revokeObjectURL(url);
  };
  img.src = url;
}

// ── 자판기와 잇기 ─────────────────────────────────────────────────────
// 자판기에서 남긴 생각·질문·메모·별표·좋아요를 생각으로 가져옵니다 (읽기만 함, 자판기 기록은 그대로).
// 같은 주소(jeffreryinko.github.io)라 이 기기의 자판기 기록을 바로 읽고, 다른 기기 것은 자판기가 올려 둔 서버 칸(kv)에서 읽습니다.
const VFM_APPS = { ai: 'AI 소식', history: '역사', tools: '도구', deal: '딜', brain: '뇌', book: '책', sisa: '시사' };
async function vfmImport(manual) {
  const src = new Map(), mergeV = (a, b) => Array.isArray(a) && Array.isArray(b) ? [...new Map([...a, ...b].filter(x => x && x.id).map(x => [x.id, x])).values()] : a && b && typeof a === 'object' && typeof b === 'object' ? { ...a, ...b } : (b ?? a);
  if (sb) try {
    const rs = await Promise.all(['vfm:box:%', 'vfm:%:star', 'vfm:%:memo', 'vfm:likes'].map(pat => sb.from('kv').select('k,v').like('k', pat)));
    rs.forEach(r => (r.data || []).forEach(x => src.set(x.k, x.v)));
  } catch (e) { console.warn(e); }
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (/^vfm:(box:(qs|think)|[a-z]+:(star|memo)|likes)$/.test(k)) try { src.set(k, mergeV(src.get(k), JSON.parse(localStorage.getItem(k)))); } catch { /* 깨진 값은 건너뜀 */ }
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
  if (added) { B.relKey = ''; render(); toast(`자판기에서 ${added}개를 가져왔습니다`, '지도에서 보기', () => go('map')); }
  else if (manual) toast('자판기에서 새로 가져올 것이 없습니다');
}

// ── 누르기 ───────────────────────────────────────────────────────────
const ACT = {
  close: closeAll, back: () => history.back(), search: () => openSearch(), settings: openSettings, lock: toggleLock, mantra: openMantra,
  edit: () => editNode(S.sel), save: () => saveNode(S.sel), organize: () => organize(S.sel), persp: () => perspectives(S.sel),
  toPlanner: () => toPlanner(S.sel), linkAdd: () => openSearch(S.sel), weekly, askQ: () => ask($('#q').value.trim()),
  mantraSave: () => setMantra($('#m_in').value), mantraAi, imgPick: () => openImg(S.sel), fillImages, vfmPull: () => vfmImport(true),
  imgDrop: () => { const n = node(S.sel); delete n.img; delete n.imgSrc; delete n.th; if (n.ph) { n.ph = false; const p = S.items.get('ph_' + n.id); if (p) { p.deleted = true; put(p, true); } } put(n, true); openNode(n.id); render(); },
  togglePrivate: () => { const n = node(S.sel); n.p = !n.p; put(n, true); B.relKey = ''; if (n.p && !S.unlocked) { toast('잠금 영역으로 옮겼습니다'); closeAll(); } else { openNode(n.id); render(); } },
  del: () => { if (!confirm('이 생각을 지울까요?')) return; const n = node(S.sel); n.deleted = true; put(n, true); all('link').filter(l => l.a === n.id || l.b === n.id).forEach(l => { l.deleted = true; put(l, true); }); B.relKey = ''; toast('생각을 지웠습니다'); closeAll(); },
  linkType: el => { const l = S.items.get(el.dataset.id); l.r = l.r === 'contra' ? 'rel' : 'contra'; l.by = 'me'; put(l, true); B.relKey = ''; openNode(S.sel); },
  linkDel: el => { const l = S.items.get(el.dataset.id); l.deleted = true; put(l, true); B.relKey = ''; openNode(S.sel); },
  fit: () => fitBoard(true), zin: () => zoomAt(1.3), zout: () => zoomAt(1 / 1.3), relToggle: () => { B.rel = !B.rel; render(); }, replay,
  replayGo: () => { go('rel'); setTimeout(replay, 200); },
  aiSave: () => { const s = settings(); s.gkey = $('#s_gkey').value.trim(); s.gmodel = $('#s_gmodel').value.trim() || 'gemini-flash-latest'; put(s, true); toast('AI 설정을 저장했습니다'); },
  notiAdd: () => notiChange(a => a.push({ id: newId().slice(0, 6), kind: 'nudge', time: '18:00', days: [1, 2, 3, 4, 5, 6, 7], on: true })),
  notiDel: el => notiChange(a => a.splice(+el.dataset.id, 1)),
  pushOn, pushOff, pushTest: async () => { if (!sb) return; const { data, error } = await sb.rpc('think_push_test'); toast(error ? '알림을 보내지 못했습니다' : data ? '알림을 보냈습니다' : '알림을 켠 기기가 없습니다'); },
  pinSet: async () => { const p = prompt('새 비밀번호'); if (!p) return; const s = settings(); s.pin = await sha(p); put(s, true); openSettings(); },
  pinClear: () => { const s = settings(); delete s.pin; put(s, true); openSettings(); },
  logout: async () => { await flush(); if (sb) await sb.auth.signOut(); ['tfm:cache', 'tfm:q'].forEach(k => localStorage.removeItem(k)); location.reload(); },
  export: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify([...S.items.values()], null, 1)], { type: 'application/json' })); a.download = `thinkingForMe-${ymd()}.json`; a.click(); },
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-node],[data-go],[data-tog],[data-pick],[data-mantra],[data-day],[data-img]'); if (!t) return;
  if (B.drag > 8 && t.closest('#bd')) return;   // 보드를 끌다가 손을 뗀 것은 누른 것으로 치지 않음
  const d = t.dataset;
  if (d.act) return ACT[d.act]?.(t);
  if (d.go) return go(d.go);
  if (d.node) return openNode(d.node);
  if (d.pick) { addLink(S.pick, d.pick); B.relKey = ''; toast('두 생각을 이었습니다'); return history.back(); }
  if (d.mantra) return setMantra(d.mantra);
  if (d.img) { const n = node(S.sel); n.img = d.img; n.imgSrc = d.src; n.kw = $('#imgQ').value.trim(); delete n.th; put(n, true); B.relKey = ''; return history.back(); }
  if (d.day) { const [i, j] = d.day.split(':').map(Number); return notiChange(a => { const ds = new Set(a[i].days || []); ds.has(j) ? ds.delete(j) : ds.add(j); a[i].days = [...ds].sort(); }); }
  if (d.tog) { const k = d.tog; if (isOpen(k, +d.lvl)) { S.open.add('!' + k); S.open.delete(k); } else { S.open.add(k); S.open.delete('!' + k); } ls.set('tfm:open', JSON.stringify([...S.open]));
    const was = B.items.find(i => i.tog === k); render();
    const now = B.items.find(i => i.tog === k);   // 누른 가지가 화면에서 제자리에 있도록 판을 맞춰 옮김
    if (was && now) { B.tx += (was.x - now.x) * B.k; B.ty += (was.y - now.y) * B.k; applyT(); }
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.noti != null) notiChange(a => { const n = a[+t.dataset.noti]; n[t.dataset.k] = t.dataset.k === 'on' ? t.checked : t.dataset.k === 'time' ? round5(t.value || '09:00') : t.value; });
  if (t.id === 'photoIn' && t.files[0]) addPhoto(S.sel, t.files[0]);
});
document.addEventListener('error', e => { const t = e.target; if (t.tagName === 'IMG' && t.classList.contains('th')) { t.removeAttribute('src'); t.style.visibility = 'hidden'; } }, true);
$('#depth').addEventListener('input', e => { S.depth = +e.target.value; ls.set('tfm:depth', S.depth); S.open.clear(); ls.set('tfm:open', '[]'); render(); });
$('#quick').addEventListener('submit', e => { e.preventDefault(); const i = $('#quickIn'); addThought(i.value); i.value = ''; });
addEventListener('hashchange', () => { if (location.hash === '#review') { history.replaceState(history.state, '', location.pathname); go('review'); } });
addEventListener('online', flush);
addEventListener('resize', () => { if ($('#bd')) applyT(); });
addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });

// ── 시작: 로그인 → 내 계정 확인 → 불러오기 ────────────────────────────
function gate(html) { $('#app').hidden = true; $('#gate').hidden = false; $('#gate').innerHTML = `<h1>thinkingForMe</h1>${html}`; }
const opened = () => { if (Date.now() - +(ls.get('tfm:lastOpen') || 0) > 30 * 60e3) { ls.set('tfm:lastOpen', Date.now()); bump(); return true; } };
async function start(user) {
  S.user = user;
  try { JSON.parse(ls.get('tfm:cache') || '[]').forEach(i => S.items.set(i.id, i)); } catch { /* 저장본 없음 */ }
  $('#gate').hidden = true; $('#app').hidden = false;
  if (location.hash === '#review') S.view = 'review';
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
  const user = data.session?.user;
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
