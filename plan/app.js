/* app.js — 90일 작전판: 매일 여는 한 화면.
   탭 4개: 오늘(그날 할 일을 순서대로) · 여정(90일 지도·합격 기준·사다리) · 기록(점수·숫자·3줄·아이디어) · 자료(선언·토론·교본·만화·그림·납품 사양)
   기록 모양 jh90.state = { log:{날짜:{sleep,work,dry,log,walk,phone,pub,react,rev,ex,min,t}}, notes:{날짜:{a,l1,l2,l3,map,t}},
                           ideas:[{id,text,at,del}], gates:{"g-i":true}, prep:{}, u }
   동기화: thinkingForMe에 로그인돼 있으면 think_items 의 한 줄(id 'p90', kind 'p90')에 통째로 올리고, 기기끼리 날짜별로 최신 것을 합침.
           3줄 기록은 생각(kind node, 분류 '90일 작전', 종류 '기록'), 새 아이디어는 구상(종류 '구상', 단계 씨앗)으로도 들어감.
   홈 카드(plan.js)는 jh90.log 를 읽으므로 log 를 그대로 거기에도 적어 둠. */
(function () {
  "use strict";
  var P = window.TFM_PLAN, D = window.P90DATA, ART = window.P90ART, CFG = window.TFM_CONFIG || {};
  var N = 90, START = P.START, WD = "일월화수목금토";
  var $ = function (s, el) { return (el || document).querySelector(s); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function key(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function md(d) { return (d.getMonth() + 1) + "/" + d.getDate() + " (" + WD[d.getDay()] + ")"; }
  function won(n) { return (n || 0).toLocaleString("ko-KR") + "원"; }
  var TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);
  var TK = key(TODAY), DN = Math.floor((TODAY - START) / 864e5) + 1;
  var dkey = function (d) { return key(addDays(START, d - 1)); };

  /* ---------- 저장 ---------- */
  var LS = "jh90.state", NQ = "jh90.nq";
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  var S = lsGet(LS, null);
  if (!S) { // 예전 기록판(jh90.log·jh90.ideas)에서 옮겨 옴
    S = { v: 2, log: {}, notes: {}, ideas: [], gates: {}, prep: {}, u: 0 };
    var ol = lsGet("jh90.log", {}), oi = lsGet("jh90.ideas", []);
    Object.keys(ol).forEach(function (k) { S.log[k] = Object.assign({}, ol[k], { t: Date.now() }); });
    oi.forEach(function (t, i) { S.ideas.push({ id: "o" + i, text: t, at: Date.now() }); });
  }
  ["log", "notes", "gates", "prep"].forEach(function (k) { S[k] = S[k] || {}; }); S.ideas = S.ideas || [];
  var nodeQ = lsGet(NQ, []);
  function save(noSync) {
    S.u = Date.now();
    if (!lsSet(LS, S)) toast("이 브라우저는 저장이 막혀 있어 창을 닫으면 기록이 사라집니다");
    lsSet("jh90.log", S.log);
    if (!noSync) Sync.later();
  }
  function rec(k) { return S.log[k] || (S.log[k] = { t: 0 }); }
  function touch(k) { rec(k).t = Date.now(); }

  /* ---------- 계산 ---------- */
  function score(r, k) { return r ? (r.work ? 2 : 0) + (r.sleep ? 2 : 0) + (r.dry ? 1 : 0) + (+r.pub || 0) * 10 + (+r.react || 0) * 5 + (+r.rej || 0) * 3 + ((+r.rev || 0) > 0 ? 50 : 0) + (k && k === firstPay() ? 300 : 0) : 0; }
  function firstPay() { var ks = Object.keys(S.log).filter(function (k) { return (+S.log[k].rev || 0) > 0; }).sort(); return ks[0] || ""; }
  function total(f) { var t = 0; Object.keys(S.log).forEach(function (k) { t += f(S.log[k], k); }); return t; }
  // 만든 날 연속: 쉬어도 되는 날(아이 아픔·가족 멈춤)은 건너뜀, 이틀 연속 빠지면 끊김
  function streak(field) {
    var n = 0, gap = 0, d = new Date(TODAY);
    for (var i = 0; i < 400; i++) {
      var r = S.log[key(d)];
      if (r && r[field]) { n++; gap = 0; }
      else if (r && (r.ex || r.frz) && field === "work") { /* 쉬는 날·보호권 */ }
      else if (field === "dry") { if (i > 0) break; }
      else { if (i > 0) gap++; if (gap >= 2) break; }
      d = addDays(d, -1);
    }
    return n;
  }
  function stats() {
    return {
      score: total(score), rej: total(function (r) { return +r.rej || 0; }), frz: frzLeft(), days: total(function (r) { return r.work ? 1 : 0; }), sleep: total(function (r) { return r.sleep ? 1 : 0; }),
      pub: total(function (r) { return +r.pub || 0; }), react: total(function (r) { return +r.react || 0; }), rev: total(function (r) { return +r.rev || 0; }),
      dryDays: total(function (r) { return r.dry ? 1 : 0; }), streak: streak("work"), dry: streak("dry")
    };
  }
  function frzLeft() { var m = TK.slice(0, 7); return 2 - Object.keys(S.log).filter(function (k) { return k.slice(0, 7) === m && S.log[k].frz; }).length; }
  function ladder() { // 공개 사다리: 그 칸 과제를 한 날 자동 표시
    var done = {};
    for (var d = 1; d <= N; d++) { var r = S.log[dkey(d)]; if (!r || !r.work) continue; var x = P.day(d), m = /\[사다리 (\d)칸\]/.exec(x.task);
      if (m) done[m[1]] = done[m[1]] || dkey(d); if (x.kind === "게임" && /공개한다/.test(x.task)) done[3] = done[3] || dkey(d); }
    return done;
  }
  function moneyRung() {
    var days = Object.keys(S.log).sort(), best = 0, run = 0, maxRun = 0, month = {};
    days.forEach(function (k) { var v = +S.log[k].rev || 0; best = Math.max(best, v); run = v >= 100 ? run + 1 : 0; maxRun = Math.max(maxRun, run); month[k.slice(0, 7)] = (month[k.slice(0, 7)] || 0) + v; });
    var mBest = Math.max.apply(null, [0].concat(Object.keys(month).map(function (m) { return month[m]; })));
    return [best > 0, maxRun >= 30, best >= 1000, best >= 10000, mBest >= 1000000, false, mBest >= 5000000];
  }
  // 그날 과제에 맞는 토론 안건(0부터)·교본 장(0부터)·만화
  // [과제 글귀, 100차 토론 안건 번호(0부터), 교본 장(0부터)]
  var CTX = [[/예약|소개 한 장/, 23, 0], [/v1|첫 버전|만든다/, 32, 2], [/인터뷰|템플릿|답장/, 37, 1], [/광고/, 75, 3], [/결제|가격|환불/, 22, 3], [/사다리|공개|올린다|올리고/, 60, 5], [/채널/, 25, 4], [/점검/, 88, 14],
    [/게임|한 판/, 27, 11], [/불편|비교표|검색어|후기|1억|중간 판정/, 20, 0], [/기능 하나/, 31, 2], [/고장|코드/, 33, 12], [/최소 버전|성탄절|새해|가벼운/, 13, 13]];
  function ctx(x) {
    for (var i = 0; i < CTX.length; i++) if (CTX[i][0].test(x.task)) return { round: CTX[i][1], ch: CTX[i][2] };
    return { round: 5, ch: 2 };
  }
  function comicFor(d, wd) { return wd === 0 ? 9 : [0, 1, 2, 3, 4, 5, 7, 8][(d - 1) % 8]; }
  var GATE_DAY = [11, 25, 30, 60, 90];

  /* ---------- 공통 UI ---------- */
  function toast(t) { var el = document.createElement("div"); el.className = "toast"; el.textContent = t; $("#toasts").appendChild(el); setTimeout(function () { el.remove(); }, 2600); }
  function sheet(html) { $("#sheetBox").innerHTML = "<button class='x' data-act='close' aria-label='닫기'>×</button>" + html; $("#sheet").hidden = false; $("#sheetBox").scrollTop = 0; document.body.style.overflow = "hidden"; }
  function closeSheet() { $("#sheet").hidden = true; document.body.style.overflow = ""; }
  function copy(text) {
    var done = function () { toast("복사했어요"); };
    try { navigator.clipboard.writeText(text).then(done, fb); } catch (e) { fb(); }
    function fb() { sheet("<h2>복사할 내용</h2><textarea class='ta' rows='10' readonly>" + esc(text) + "</textarea><p class='dim'>길게 눌러 전체 선택 후 복사하세요.</p>"); }
  }
  function ring(pc, label, sub) {
    var r = 30, c = 2 * Math.PI * r;
    return "<svg class='ring' viewBox='0 0 76 76' role='img' aria-label='" + esc(label) + "'><circle cx='38' cy='38' r='" + r + "' fill='none' stroke='var(--line)' stroke-width='8'/>" +
      (pc > 0 ? "<circle cx='38' cy='38' r='" + r + "' fill='none' stroke='var(--blue)' stroke-width='8' stroke-linecap='round' stroke-dasharray='" + (c * pc) + " " + c + "' transform='rotate(-90 38 38)'/>" : "") +
      "<text x='38' y='37' text-anchor='middle' font-size='15' font-weight='800'>" + esc(label) + "</text><text x='38' y='52' text-anchor='middle' font-size='9.5' fill='var(--dim)'>" + esc(sub) + "</text></svg>";
  }

  /* ---------- 타이머 (25분, 화면에만) ---------- */
  var T = { end: 0, id: 0 };
  function tmrText() { if (!T.end) return "25분 타이머 시작"; var s = Math.max(0, Math.round((T.end - Date.now()) / 1000)); return "남은 " + Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2) + " · 누르면 멈춤"; }
  function tmrTick() { var b = $("#tmr"); if (b) b.textContent = tmrText(); if (T.end && Date.now() >= T.end) { T.end = 0; clearInterval(T.id); toast("25분 끝. 5분 쉬고, 멈출 거면 다음 첫 줄을 적고 멈춰요"); try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {} if (b) b.textContent = tmrText(); } }
  function tmrToggle() { if (T.end) { T.end = 0; clearInterval(T.id); } else { T.end = Date.now() + 25 * 60e3; T.id = setInterval(tmrTick, 1000); } tmrTick(); }

  /* ---------- 오늘 ---------- */
  function mode(x) { return x.wk[2] === "지금대로" ? "night" : "dawn"; }
  function flowItems(x) {
    var wkend = x.wd === 0 || x.wd === 6, walkDay = x.wd === 1 || x.wd === 3 || x.wd === 6, night = mode(x) === "night";
    var walkMin = x.wk[5].split(" ")[0], it = [];
    it.push({ id: "sleep", o: 1, t: night ? "아침" : "기상 " + x.wk[2], l: "어젯밤 7시간 잤다", s: "취침 " + x.wk[3] + " 기준" });
    it.push({ id: "work", o: night ? 5 : 2, t: wkend ? "60분" : x.wk[7].replace(/^(밤|새벽) /, "").split("~")[0], l: "미션 하기", s: wkend ? "주말은 60분을 넘기지 않기" : night ? "밤 모드: 45분만" : "첫 30분은 정리, 그 뒤 만들기" });
    if (walkDay) it.push({ id: "walk", o: 3, t: "점심", l: "걷기 " + walkMin, s: "월·수·토" });
    it.push({ id: "phone", o: 4, t: "21:15", l: "폰을 거실 충전기에", s: "침실에 들고 가지 않기" });
    it.push({ id: "log", o: 6, t: "자기 전", l: "3줄 기록", s: "아래 '오늘의 글'에 쓰면 저절로 체크" });
    it.push({ id: "dry", o: 7, t: "하루", l: "술 0잔", s: "아낀 술값이 쌓여요" });
    return it.sort(function (a, b) { return a.o - b.o; });
  }
  function viewToday() {
    if (DN < 1) return viewPrestart();
    if (DN > N) return viewFinished();
    var x = P.day(DN), r = rec(TK), st = stats(), c = ctx(x), rd = D.ROUNDS[c.round], ch = D.BOOK[c.ch], n = S.notes[TK] || {};
    var items = flowItems(x), doneN = items.filter(function (i) { return r[i.id]; }).length, gi = GATE_DAY.indexOf(DN);
    var h = "", yk = key(addDays(TODAY, -1)), yn = S.notes[yk] || {}, mon = x.wd === 1 || TODAY.getDate() === 1;
    h += "<section class='hero'><div><p class='eyebrow'>" + md(TODAY) + " · " + (x.w + 1) + "주 차 " + esc(x.wk[0]) + "</p><h1>" + DN + "일 차</h1><p class='why'>나는 <b>매일 내놓는 사람</b>이다 · 왜: 가족의 안전</p></div>" + ring(DN / N, DN + "/" + N, "남은 " + (N - DN) + "일") + "</section>";
    h += "<div class='chips'><span class='chip'><b>" + st.streak + "</b>일 연속</span><span class='chip'><b>" + st.score + "</b>점</span><span class='chip'>금주 <b>" + st.dry + "</b>일</span><span class='chip'>보호권 <b>" + st.frz + "</b>장</span><span class='chip'>오늘 <b>" + doneN + "/" + items.length + "</b></span></div>";
    h += weekDots(x);
    if (mon) h += "<section class='card soft'><b>새 출발.</b> " + (TODAY.getDate() === 1 ? "새 달의 첫날" : "새 주의 첫날") + "이에요. 지난주는 지난주예요. 오늘 첫 20분만.</section>";
    h += "<section class='card first'><p class='eyebrow'>어제의 내가 정한 첫 20분</p><p class='f20'>" + (yn.l3 ? esc(yn.l3) : "어제 적은 것이 없어요. 아래 미션의 첫 줄부터 시작해요.") + "</p></section>";
    if (r.ex || r.frz) h += "<section class='card soft'><b>" + (r.frz ? "오늘은 보호권을 썼어요." : "오늘은 쉬는 날로 적었어요.") + "</b> " + esc(r.ex || "3줄은 꼭 써요") + ". 연속은 끊기지 않아요. <button class='lnk' data-act='unex'>되돌리기</button></section>";
    var build = x.kind === "도구" && DN >= 15 && DN <= 25, resv = +S.resv || 0;
    if (DN >= 11 && DN <= 25) h += "<section class='card" + (build && resv < 3 ? " warn" : "") + "'><div class='hd'><h2>예약 " + resv + " / 3건</h2><div class='pm'><button data-act='resv' data-d='-1' aria-label='예약 하나 빼기'>−</button><b>" + resv + "</b><button data-act='resv' data-d='1' aria-label='예약 하나 더하기'>+</button></div></div><p class='dim small'>" + (build && resv < 3 ? "<b>예약 3건 전에는 만들지 않아요.</b> 오늘은 만들기 대신 소개 한 장을 다른 곳에 올리고 예약을 부탁해요. 25일 차까지 안 되면 2순위 불편으로 한 번 바꿔요. 방향 신호이지 내 실패가 아니에요." : "가격을 보인 예약이 3건 모이면 만들기로 넘어가요. (100차 토론 24번)") + "</p></section>";
    if (gi >= 0) h += gateCard(gi, true);
    // 미션
    h += "<section class='card mission'><div class='hd'><span class='tag " + (x.kind === "도구" ? "t-blue" : "t-coin") + "'>" + esc(x.kind) + "</span><span class='dim'>" + esc(x.wd === 0 || x.wd === 6 ? "주말 60분" : x.wk[7] + " · " + x.wk[4] + "분") + "</span></div>" +
      "<p class='task'>" + esc(x.task) + "</p><p class='endshape'>끝의 모양: 결과물 하나(글·표·파일·화면)가 남으면 끝</p>" +
      "<button class='tmr' id='tmr' data-act='timer'>" + tmrText() + "</button>" +
      "<button class='big-btn" + (r.work ? " done" : "") + "' data-act='toggle' data-k='work'>" + (r.work ? "✓ 미션 끝냈어요" + (r.min ? " (최소 버전)" : "") : "미션 끝냈어요") + "</button>" +
      "<details class='why-box'><summary>왜 이걸 하나요 · 100차 토론 " + (c.round + 1) + "번</summary><p>" + esc(rd.res) + "</p><button class='lnk' data-act='round' data-i='" + c.round + "'>토론 전체 보기</button></details>" +
      "<details class='why-box'><summary>막히면 · 교본 " + esc(ch[0]) + "</summary><ul>" + ch[1].slice(0, 4).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul><button class='lnk' data-act='chapter' data-i='" + c.ch + "'>장 전체 보기</button></details></section>";
    var IF = D.IFS[(DN - 1) % D.IFS.length];
    h += "<section class='card if'><p class='eyebrow'>오늘의 만약</p><p><b>만약 " + esc(IF[0]) + ",</b> " + esc(IF[1]) + ".</p><button class='lnk' data-act='lib' data-k='ifs'>만약 규칙 10개</button></section>";
    // 하루 흐름
    h += "<section class='card'><div class='hd'><h2>오늘의 흐름</h2><span class='dim'>" + (mode(x) === "night" ? "밤 모드 (1~2주)" : "새벽 모드") + "</span></div><div class='flow'>" +
      items.map(function (i) { return "<button class='fi" + (r[i.id] ? " on" : "") + "' data-act='toggle' data-k='" + i.id + "'><span class='tm'>" + esc(i.t) + "</span><span class='bx'></span><span class='lb'><b>" + esc(i.l) + "</b><small>" + esc(i.s) + "</small></span></button>"; }).join("") + "</div></section>";
    // 숫자
    h += "<section class='card'><h2>오늘의 숫자</h2><div class='steps'>" +
      stepper("pub", "공개한 것", "+10점") + stepper("react", "모르는 사람 반응", "+5점") + stepper("rej", "거절 받은 것", "+3점 · 90일 30번이 목표") +
      "<label class='rev'><span><b>매출</b><small>결제가 있는 날 +50점 · 첫 결제는 +300점</small></span><input type='number' inputmode='numeric' min='0' data-num='rev' value='" + (+r.rev || "") + "' placeholder='0'></label></div></section>";
    // 글
    h += "<section class='card'><div class='hd'><h2>오늘의 글</h2><span class='dim'>" + esc(x.theme) + "</span></div><p class='q'>" + esc(x.q) + "</p>" +
      "<textarea class='ta' rows='3' data-note='a' placeholder='한두 문장이면 충분해요'>" + esc(n.a || "") + "</textarea>" +
      "<div class='three'><label>만들거나 올린 것<input data-note='l1' value='" + esc(n.l1 || "") + "'></label><label>막힌 것 하나<input data-note='l2' value='" + esc(n.l2 || "") + "'></label><label>내일 첫 20분 (내일 아침 맨 위에 떠요)<input data-note='l3' value='" + esc(n.l3 || "") + "'></label></div>" +
      "<label class='tick'><input type='checkbox' data-act='mapnote'" + (n.map !== false ? " checked" : "") + "> thinkingForMe 생각 지도에도 넣기</label></section>";
    // 일요일 보고
    if (x.wd === 0 || DN === N) h += weekCard();
    // 만화
    var ci = comicFor(DN, x.wd), sp = D.STRIPS[ci];
    h += "<section class='card'><div class='hd'><h2>오늘의 한 장면</h2><span class='dim'>" + esc(sp[0]) + "</span></div>" + ART.strip(sp, true) + "<p class='dim small'>" + esc(sp[1]) + "</p></section>";
    // 버튼
    h += "<div class='twin'><button class='ghost' data-act='crash'>오늘 무너졌어요</button><button class='ghost' data-act='idea'>새 아이디어 적기</button></div>";
    if (DN < N) { var y = P.day(DN + 1); h += "<section class='card soft'><div class='hd'><h2>내일</h2><span class='dim'>" + md(y.date) + "</span></div><p>" + esc(y.task) + "</p></section>"; }
    return h;
  }
  function weekDots(x) {
    var s = "<div class='wdots' aria-label='이번 주 진척'>", start = DN - ((DN - 1) % 7);
    for (var d = start; d < start + 7 && d <= N; d++) { var st = dayState(d); s += "<span class='" + st + "' title='" + d + "일 차'>" + WD[P.day(d).wd] + "</span>"; }
    return s + "</div>";
  }
  function stepper(k, label, sub) {
    var v = +rec(TK)[k] || 0;
    return "<div class='stp'><span><b>" + label + "</b><small>" + sub + "</small></span><div class='pm'><button data-act='step' data-k='" + k + "' data-d='-1' aria-label='" + label + " 하나 빼기'>−</button><b>" + v + "</b><button data-act='step' data-k='" + k + "' data-d='1' aria-label='" + label + " 하나 더하기'>+</button></div></div>";
  }
  function weekSum(endKey) {
    var W = { sleep: 0, work: 0, pub: 0, react: 0, rej: 0, rev: 0 }, e = new Date(endKey);
    for (var i = 0; i < 7; i++) { var r = S.log[key(addDays(e, -i))]; if (r) { if (r.sleep) W.sleep++; if (r.work) W.work++; W.pub += +r.pub || 0; W.react += +r.react || 0; W.rej += +r.rej || 0; W.rev += +r.rev || 0; } }
    W.try = W.pub + W.react + W.rej; return W;
  }
  function weekText() {
    var W = weekSum(TODAY), wk = Math.max(1, Math.floor((DN - 1) / 7) + 1);
    return "[90일 기록 " + wk + "주차 · " + TK + "]\n① 7시간 잔 날 " + W.sleep + "/7\n② 만든 날 " + W.work + "/7\n③ 시도한 것 " + W.try + "번 (공개 " + W.pub + " · 반응 " + W.react + " · 거절 " + W.rej + ")\n④ 번 돈 " + won(W.rev) + "\n금주 " + streak("dry") + "일째\n\n잘된 것: \n막힌 것: \n도움 요청: \n다음 주 한 가지: ";
  }
  function weekCard() {
    var W = weekSum(TODAY);
    return "<section class='card accent'><div class='hd'><h2>일요일 보고</h2><span class='dim'>숫자가 0이어도 올려요</span></div><div class='four'>" +
      [["7시간 잔 날", W.sleep + "/7"], ["만든 날", W.work + "/7"], ["시도", W.try + "번"], ["번 돈", won(W.rev)]].map(function (a) { return "<div><b>" + a[1] + "</b><span>" + a[0] + "</span></div>"; }).join("") +
      "</div>" + predBox() + "<button class='big-btn' data-act='copyweek'>보고 글 복사</button><p class='dim small'>올린 다음 '공개한 것'에 +1을 누르세요. 결과 목표(1억)는 쓰지 않고 숫자만 올려요.</p>" +
      (TODAY.getDate() <= 7 ? "<div class='res'><b>이번 달 첫 일요일: 가족 회의 10분.</b> 숫자 보여 주기, 다음 달 시간 정하기, 멈춤 권리 확인.</div>" : "") + "</section>";
  }
  function predBox() {
    var wkI = Math.floor((DN - 1) / 7), prev = (S.pred || {})[wkI - 1], W = weekSum(TODAY), cur = (S.pred || {})[wkI];
    return "<div class='pred'>" + (prev != null ? "<p>지난주에 예측한 만든 날 <b>" + prev + "일</b> → 실제 <b>" + W.work + "일</b>" + (W.work < prev ? " · 예측이 컸어요. 이번엔 조금 낮춰 보세요." : " · 잘 맞췄어요.") + "</p>" : "") +
      "<label>다음 주에 만들 날 예측<select data-pred='" + wkI + "'>" + [0, 1, 2, 3, 4, 5, 6, 7].map(function (n) { return "<option" + (cur === n ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select></label></div>";
  }
  function gateCard(gi, today) {
    var g = D.GATES[gi];
    return "<section class='card gate'><div class='hd'><h2>" + (today ? "오늘은 점검일 · " : "") + esc(g[0]) + "</h2><span class='tag t-coin'>" + esc(g[1]) + "</span></div><div class='gl'>" +
      g[2].map(function (t, i) { var k = gi + "-" + i; return "<label class='tick'><input type='checkbox' data-gate='" + k + "'" + (S.gates[k] ? " checked" : "") + "> " + esc(t) + "</label>"; }).join("") +
      "</div><p class='dim small'><b>미달이면:</b> " + esc(g[3]) + "</p></section>";
  }
  function viewPrestart() {
    var x1 = P.day(1), prep = [["phone", "21시 15분에 폰을 거실 충전기에 꽂는다"], ["paper", "내일 첫 과제를 종이에 적는다"], ["doc", "노트북에 빈 문서를 열어 둔다"], ["bed", "23시에 눕는다"], ["dry", "술은 오늘부터 0잔"], ["doctor", "처방의 예약 날짜를 정한다 (새벽 작업·금주 상의)"]];
    var h = "<section class='hero'><div><p class='eyebrow'>" + md(TODAY) + " · 시작 " + (1 - DN) + "일 전</p><h1>내일 1일 차</h1><p class='why'>왜 하는가 · <b>가족의 안전</b></p></div>" + ring(0, "D-" + (1 - DN), "11/17 시작") + "</section>";
    h += "<section class='card'><h2>쓰는 법</h2><ol class='how'><li><b>출근길 3분</b>: 어제의 내가 정한 첫 20분과 오늘의 만약을 읽어요.</li><li><b>하루 동안</b> 흐름에 있는 것을 끝낼 때마다 눌러요.</li><li><b>퇴근길이나 자기 전</b>에 3줄을 써요(음성 입력도 돼요). '내일 첫 20분'이 내일 아침 맨 위에 떠요.</li></ol><p class='dim small'>막히면 미션 아래 '왜 이걸 하나요'와 '막히면'을 펼치세요. 100차 토론과 교본에서 그날에 맞는 부분만 보여 줘요.</p></section>";
    h += "<section class='card'><h2>오늘 밤 준비</h2><div class='gl'>" + prep.map(function (p) { return "<label class='tick'><input type='checkbox' data-prep='" + p[0] + "'" + (S.prep[p[0]] ? " checked" : "") + "> " + p[1] + "</label>"; }).join("") + "</div></section>";
    h += "<section class='card mission'><div class='hd'><span class='tag t-blue'>내일 미션</span><span class='dim'>" + esc(x1.wk[7]) + "</span></div><p class='task'>" + esc(x1.task) + "</p></section>";
    h += "<section class='card'><div class='hd'><h2>선언문</h2><button class='lnk' data-act='copypledge'>복사</button></div><div class='pledge'>" + esc(D.PLEDGE) + "</div><p class='dim small'>내일 첫 과제가 이 글을 닉네임 계정에 올리는 거예요. 공개 사다리 2칸입니다.</p></section>";
    h += "<section class='card'><div class='hd'><h2>한 장면</h2><span class='dim'>" + esc(D.STRIPS[2][0]) + "</span></div>" + ART.strip(D.STRIPS[2], true) + "</section>";
    h += "<div class='twin'><button class='ghost' data-act='idea'>새 아이디어 적기</button><button class='ghost' data-go='library'>자료 보기</button></div>";
    return h;
  }
  function viewFinished() {
    var st = stats();
    return "<section class='hero'><div><p class='eyebrow'>90일이 끝났어요</p><h1>결과 정리</h1></div>" + ring(1, "90/90", "완료") + "</section>" +
      "<section class='card'><div class='four'><div><b>" + st.days + "</b><span>만든 날</span></div><div><b>" + st.pub + "</b><span>공개</span></div><div><b>" + won(st.rev) + "</b><span>매출</span></div><div><b>" + st.score + "</b><span>점수</span></div></div></section>" +
      "<section class='card'><h2>다음 90일 전에</h2><ul class='plain'><li>결과 글을 올린다</li><li>아이디어 주차장을 읽고 '누가 돈을 내나'를 붙인다</li><li>1억 경로를 실제 숫자로 다시 계산한다</li></ul></section>";
  }

  /* ---------- 여정 ---------- */
  function dayState(d) {
    var k = dkey(d), r = S.log[k];
    if (d === DN) return "today";
    if (d > DN) return "fut";
    if (r && r.ex) return "ex";
    if (r && r.work) return r.min ? "min" : "done";
    return "miss";
  }
  function viewJourney() {
    var h = "<h1 class='pg'>여정</h1>";
    h += "<section class='card'><div class='hd'><h2>90일 지도</h2><span class='dim'>칸을 누르면 그날</span></div><div class='cal'>";
    for (var w = 0; w < 13; w++) {
      var wk = P.WK[w];
      h += "<div class='wrow'><span class='wl'><b>" + (w + 1) + "주</b><small>" + esc(wk[0].split(" · ")[0]) + "</small></span><div class='wd'>";
      for (var d = w * 7 + 1; d <= Math.min(N, w * 7 + 7); d++) { var x = P.day(d), s = dayState(d); h += "<button class='dc " + s + "' data-act='day' data-d='" + d + "' aria-label='" + d + "일 차 " + md(x.date) + "'>" + x.date.getDate() + "<i>" + (x.kind === "도구" ? "" : "•") + "</i></button>"; }
      h += "</div></div>";
    }
    h += "</div><div class='legend'><span style='--c:var(--blue)'>만든 날</span><span style='--c:var(--blue2)'>최소 버전</span><span style='--c:var(--go-soft)'>쉬는 날</span><span style='--c:var(--bad-soft)'>빠진 날</span><span>• 주말 게임</span></div></section>";
    // 합격 기준
    h += "<h2 class='sec'>합격 기준 5개</h2>" + D.GATES.map(function (g, i) { var n = g[2].filter(function (_, j) { return S.gates[i + "-" + j]; }).length; return "<details class='card fold'" + (DN >= GATE_DAY[i] - 6 && DN <= GATE_DAY[i] ? " open" : "") + "><summary><span>" + esc(g[0]) + " <small class='dim'>" + esc(g[1]) + "</small></span><span class='tag " + (n === g[2].length ? "t-go" : "t-blue") + "'>" + n + "/" + g[2].length + "</span></summary>" + gateCard(i).replace(/^<section class='card gate'>/, "<div>").replace(/<\/section>$/, "</div>") + "</details>"; }).join("");
    // 공개 사다리
    var L = ladder(), steps = ["익명 질문", "닉네임 기록 글", "게임 공개", "도구 공개", "결제 요청"];
    h += "<h2 class='sec'>공개 사다리</h2><section class='card'><div class='ladder'>" + steps.map(function (t, i) { var on = L[i + 1]; return "<div class='lr" + (on ? " on" : "") + "'><span class='n'>" + (i + 1) + "</span><b>" + t + "</b><small>" + (on ? on.slice(5).replace("-", "/") + " 오름" : "") + "</small></div>"; }).reverse().join("") + "</div><p class='dim small'>그 칸이 적힌 미션을 끝낸 날 저절로 올라가요. 지적이 무서운 사람은 낮은 칸부터 두 번씩.</p></section>";
    // 돈 사다리
    var M = moneyRung(), rungs = [["첫 결제 1건", "인생 첫 1"], ["매일 100원 × 30일", "우연이 아니라는 증거"], ["하루 1,000원", "구독료를 스스로"], ["하루 1만 원", "아내에게 보여 줄 첫 숫자"], ["월 100만 원", "방향이 맞다는 신호"], ["월 300만 원 × 3개월", "퇴사 검토 지점"], ["월 500만 원", "본인이 정한 기준선"]];
    h += "<h2 class='sec'>돈 사다리</h2><section class='card'><div class='ladder'>" + rungs.map(function (r, i) { return "<div class='lr" + (M[i] ? " on" : "") + (i === 5 ? " gate" : "") + "'><span class='n'>" + (i + 1) + "</span><b>" + r[0] + "</b><small>" + r[1] + "</small></div>"; }).reverse().join("") + "</div><p class='dim small'>매출 칸에 넣은 숫자로 저절로 올라가요. 퇴사 조건은 6칸 + 예비금 6개월 + 아내의 동의.</p></section>";
    h += "<h2 class='sec'>1억, 두 가지 뜻</h2><section class='card'><div class='dec'><dt>깃발</dt><dd>1년 누적 매출 1억. 12개월 차에 월 3,600만 원. 월 29,000원이면 약 1,240곳.</dd><dt>추적</dt><dd>12개월 차 월 834만 원(연 환산 1억). 월 29,000원이면 약 288곳.</dd></div><p class='dim small'>100차 토론 11번 결론. 어느 쪽인지는 주현 님이 정해요. 그 전까지 둘 다 보여 줘요.</p></section>";
    var f = ART.figs[3]; h += "<section class='card fig'><h2>" + f[0] + "</h2>" + f[1] + "<p class='dim small'>" + f[2] + "</p></section>";
    return h;
  }
  function daySheet(d) {
    var x = P.day(d), k = dkey(d), r = S.log[k] || {}, n = S.notes[k] || {};
    var h = "<p class='eyebrow'>" + d + "일 차 · " + md(x.date) + " · " + (x.w + 1) + "주 차 " + esc(x.wk[0]) + "</p><h2>" + esc(x.kind) + "</h2><p class='task'>" + esc(x.task) + "</p>";
    h += "<p class='dim small'>작업 " + esc(x.wd === 0 || x.wd === 6 ? "주말 60분" : x.wk[7]) + " · 취침 " + esc(x.wk[3]) + " · 숏폼 " + esc(x.wk[6]) + "</p>";
    h += "<div class='q'>" + esc(x.q) + "</div>";
    if (d <= DN) {
      h += "<div class='chips'>" + [["work", "미션"], ["sleep", "7시간"], ["dry", "금주"], ["walk", "걷기"], ["log", "3줄"]].map(function (a) { return "<span class='chip" + (r[a[0]] ? " on" : "") + "'>" + a[1] + "</span>"; }).join("") + "</div>";
      if (r.ex) h += "<p>쉬는 날: " + esc(r.ex) + "</p>";
      if (n.a || n.l1) h += "<div class='note'>" + (n.a ? "<p>" + esc(n.a) + "</p>" : "") + [n.l1, n.l2, n.l3].filter(Boolean).map(function (t) { return "<p>· " + esc(t) + "</p>"; }).join("") + "</div>";
      if (d < DN && !(r.work)) h += "<button class='ghost' data-act='late' data-d='" + d + "'>그날 했는데 체크를 못 했어요</button>";
    }
    sheet(h);
  }

  /* ---------- 기록 ---------- */
  function viewRecords() {
    var st = stats(), h = "<h1 class='pg'>기록</h1>";
    h += "<section class='card'><div class='four'><div><b>" + st.score + "</b><span>점수</span></div><div><b>" + st.days + "</b><span>만든 날</span></div><div><b>" + st.pub + "</b><span>공개</span></div><div><b>" + won(st.rev) + "</b><span>매출</span></div></div>" +
      "<div class='four'><div><b>" + st.rej + "/30</b><span>거절</span></div><div><b>" + (st.pub + st.react + st.rej) + "</b><span>굴린 주사위</span></div><div><b>" + st.frz + "</b><span>보호권 남음</span></div><div><b>" + (+S.resv || 0) + "</b><span>예약</span></div></div>" +
      "<div class='four'><div><b>" + st.streak + "</b><span>연속</span></div><div><b>" + st.sleep + "</b><span>7시간 잔 날</span></div><div><b>" + st.dry + "</b><span>금주 연속</span></div><div><b>" + won(st.dryDays * 9000) + "</b><span>아낀 술값</span></div></div>" +
      "<p class='dim small'>점수: 공개 10 · 반응 5 · 거절 3 · 결제가 있는 날 50 · 첫 결제 300 · 만든 날 2 · 7시간 잔 날 2 · 금주 1. 점수는 행동을 돕는 장치일 뿐, 30·60·90일 판정은 매출과 대화 수로 해요. 아낀 술값은 금주 하루 9천 원 가정.</p></section>";
    h += "<section class='card fig'><h2>점수가 쌓이는 모양</h2>" + scoreChart() + "</section>";
    h += "<section class='card fig'><h2>주마다 숫자 넷</h2>" + weekBars() + "</section>";
    var ks = Object.keys(S.notes).filter(function (k) { var n = S.notes[k]; return n && (n.a || n.l1 || n.l2 || n.l3); }).sort().reverse();
    h += "<section class='card'><div class='hd'><h2>3줄 기록</h2><span class='dim'>" + ks.length + "일</span></div>" + (ks.length ? ks.map(function (k) {
      var n = S.notes[k], d = Math.floor((new Date(k) - START) / 864e5) + 1, x = d >= 1 && d <= N ? P.day(d) : null;
      return "<div class='entry'><p class='eyebrow'>" + k.slice(5).replace("-", "/") + (x ? " · " + d + "일 차" : "") + "</p>" + (x ? "<p class='dim small'>" + esc(x.q) + "</p>" : "") + (n.a ? "<p>" + esc(n.a) + "</p>" : "") + [n.l1, n.l2, n.l3].filter(Boolean).map(function (t) { return "<p>· " + esc(t) + "</p>"; }).join("") + "</div>";
    }).join("") : "<p class='dim'>오늘 화면의 '오늘의 글'에 쓰면 여기에 쌓여요.</p>") + "</section>";
    var ideas = S.ideas.filter(function (i) { return !i.del; });
    h += "<section class='card'><div class='hd'><h2>아이디어 주차장</h2><button class='lnk' data-act='idea'>적기</button></div>" + (ideas.length ? "<ul class='ideas'>" + ideas.map(function (i) { return "<li><span>" + esc(i.text) + "<small>" + new Date(i.at).toLocaleDateString("ko-KR") + "</small></span><button class='lnk' data-act='delidea' data-id='" + i.id + "'>지우기</button></li>"; }).join("") + "</ul>" : "<p class='dim'>아직 없어요.</p>") + "<p class='dim small'>2027-02-14에 한꺼번에 봐요. 그 전에는 시작하지 않아요. 적은 아이디어는 thinkingForMe의 '구상'(씨앗)으로도 들어가요.</p></section>";
    h += "<section class='card'><h2>저장</h2><p id='syncSt' class='dim'>" + esc(Sync.st) + "</p><a class='lnk' href='../'>thinkingForMe 열기</a></section>";
    return h;
  }
  function scoreChart() {
    var pts = [], cum = 0, last = Math.max(1, Math.min(N, DN));
    for (var d = 1; d <= last; d++) { cum += score(S.log[dkey(d)], dkey(d)); pts.push(cum); }
    var mx = Math.max(100, cum), X = function (i) { return 36 + i * (296 / (N - 1)); }, Y = function (v) { return 150 - v / mx * 130; };
    var grid = [0, .5, 1].map(function (f) { var v = Math.round(mx * f); return "<line x1='36' y1='" + Y(v) + "' x2='332' y2='" + Y(v) + "' stroke='var(--line)'/><text x='32' y='" + (Y(v) + 4) + "' text-anchor='end' font-size='10'>" + v + "</text>"; }).join("");
    var xl = [1, 30, 60, 90].map(function (d) { return "<text x='" + X(d - 1) + "' y='168' text-anchor='middle' font-size='10'>" + d + "일</text>"; }).join("");
    var line = pts.map(function (v, i) { return X(i) + "," + Y(v); }).join(" ");
    return "<svg viewBox='0 0 340 176' role='img' aria-label='누적 점수 " + cum + "점'>" + grid + xl + (pts.length > 1 ? "<polyline points='36,150 " + line + " " + X(pts.length - 1) + ",150' fill='var(--blue2)' stroke='none'/><polyline points='" + line + "' fill='none' stroke='var(--blue)' stroke-width='2.5'/>" : "") +
      "<circle cx='" + X(pts.length - 1) + "' cy='" + Y(cum) + "' r='4.5' fill='var(--blue)' stroke='var(--card)' stroke-width='2'/><text x='" + Math.min(X(pts.length - 1) + 8, 300) + "' y='" + (Y(cum) - 8) + "' font-size='11' font-weight='700'>" + cum + "점</text></svg>" +
      (DN < 1 ? "<p class='dim small'>11월 17일부터 쌓여요.</p>" : "");
  }
  function weekBars() {
    var weeks = Math.max(1, Math.min(13, Math.ceil(Math.max(1, DN) / 7))), rows = [];
    for (var w = 0; w < weeks; w++) { var W = { sleep: 0, work: 0, pub: 0 }; for (var d = w * 7 + 1; d <= Math.min(N, w * 7 + 7); d++) { var r = S.log[dkey(d)]; if (r) { if (r.sleep) W.sleep++; if (r.work) W.work++; W.pub += +r.pub || 0; } } rows.push(W); }
    var bw = 296 / 13, h = "<svg viewBox='0 0 340 150' role='img' aria-label='주별 7시간 잔 날, 만든 날, 공개 수'>";
    [0, 7].forEach(function (v) { var y = 120 - v / 7 * 100; h += "<line x1='36' y1='" + y + "' x2='332' y2='" + y + "' stroke='var(--line)'/><text x='32' y='" + (y + 4) + "' text-anchor='end' font-size='10'>" + v + "</text>"; });
    rows.forEach(function (W, i) { var x = 38 + i * bw;[["sleep", "var(--coin)"], ["work", "var(--blue)"], ["pub", "var(--go)"]].forEach(function (s, j) { var v = Math.min(7, W[s[0]]), hh = v / 7 * 100; h += "<rect x='" + (x + j * 6.5) + "' y='" + (120 - hh) + "' width='5.5' height='" + Math.max(hh, .5) + "' rx='1.5' fill='" + s[1] + "'/>"; }); h += "<text x='" + (x + 9) + "' y='136' text-anchor='middle' font-size='9.5'>" + (i + 1) + "주</text>"; });
    return h + "</svg><div class='legend'><span style='--c:var(--coin)'>7시간 잔 날</span><span style='--c:var(--blue)'>만든 날</span><span style='--c:var(--go)'>공개 (7 이상은 7로)</span></div>";
  }

  /* ---------- 자료 ---------- */
  var LIB = [
    ["pledge", "선언문", "90일 동안 지킬 약속. 복사해서 올리기"],
    ["debate", "100차 토론", "16명, 10단계 100판. 반박·입장 변경·가중 표결"],
    ["decisions", "핵심 규칙 7개", "100판을 일곱 줄로"],
    ["ifs", "만약 규칙 10개", "그 순간이 오면 할 행동"],
    ["book", "교본 18장", "막힐 때 펴 보는 방법서"],
    ["comics", "만화 10장면", "가장 자주 넘어지는 순간들"],
    ["figures", "그림 9장", "고리, 깔때기, 곡선, 로드맵, 흐름도"],
    ["swaps", "생각 바꾸기", "버릴 생각 여덟 개와 그 자리에 넣을 생각"],
    ["spec", "납품 사양", "위험 10개와 내놓기 전 점검 10항"],
    ["all", "90일 과제 전체", "날짜별 미션과 글 질문 90개"]];
  function viewLibrary() {
    return "<h1 class='pg'>자료</h1><p class='dim' style='margin:0 4px 12px'>오늘 화면에는 그날 필요한 부분만 나와요. 전체는 여기서 봐요.</p><div class='lib'>" +
      LIB.map(function (l) { return "<button class='card li' data-act='lib' data-k='" + l[0] + "'><b>" + l[1] + "</b><span class='dim'>" + l[2] + "</span></button>"; }).join("") + "</div>";
  }
  function roundHtml(i) {
    var r = D.ROUNDS[i], R = D.ROLES, tot = r.vote.reduce(function (a, v) { return a + v[1]; }, 0), mx = Math.max.apply(null, r.vote.map(function (v) { return v[1]; }));
    function av(id) { var o = R[id]; return "<span class='av" + (o[3] ? " opp" : "") + "' style='--c:" + o[2] + "'>" + o[1] + "</span>"; }
    return "<p class='eyebrow'>" + (r.p + 1) + "단계 " + esc(D.PHASES[r.p]) + " · " + (i + 1) + " / 100</p><h2>" + esc(r.t) + "</h2>" + (r.flip ? "<p class='flipline'>뒤집힘: " + esc(r.flip) + "</p>" : "") + "<div class='thr'>" +
      r.turns.map(function (t) { var o = R[t[0]]; return "<div class='tn" + (t[0] === "mod" ? " mod" : "") + (o[4] ? " loud" : "") + "' style='--c:" + o[2] + "'>" + av(t[0]) + "<div class='bb'><div class='who'>" + (o[4] ? "★ " : "") + o[0] + (t[2] ? "<span class='ttag " + (t[2] === "입장 바꿈" ? "입장" : t[2]) + "'>" + t[2] + "</span>" : "") + "</div>" + esc(t[1]) + "</div></div>"; }).join("") +
      "</div><b>가중 표결 (20표, ★ 2표씩)</b><div class='vote'>" + r.vote.map(function (v) { return "<div class='vr" + (v[1] === mx ? " win" : "") + "'><span>" + esc(v[0]) + "</span><div class='bar'><i style='width:" + (v[1] / tot * 100) + "%'></i></div><b>" + v[1] + "</b></div>"; }).join("") +
      "</div><div class='res'><b>결론.</b> " + esc(r.res) + "</div>" + (r.ref ? "<p class='small'><b>앱에 반영:</b> " + esc(r.ref) + "</p>" : "") +
      "<div class='twin'>" + (i > 0 ? "<button class='ghost' data-act='round' data-i='" + (i - 1) + "'>이전 안건</button>" : "<span></span>") + (i < 99 ? "<button class='ghost' data-act='round' data-i='" + (i + 1) + "'>다음 안건</button>" : "<span></span>") + "</div>";
  }
  function phaseSheet(pi) {
    sheet("<p class='eyebrow'>100차 토론 · " + (pi + 1) + "단계</p><h2>" + esc(D.PHASES[pi]) + "</h2>" + D.ROUNDS.slice(pi * 10, pi * 10 + 10).map(function (r, j) { var i = pi * 10 + j, top = r.vote.slice().sort(function (a, b) { return b[1] - a[1]; })[0]; return "<button class='row' data-act='round' data-i='" + i + "'><span class='no'>" + (i + 1) + "</span><span><b>" + esc(r.t) + "</b><small>" + esc(top[0]) + " " + top[1] + "/20 · " + esc(r.res.slice(0, 46)) + "…</small></span></button>"; }).join("") +
      "<div class='twin'>" + (pi > 0 ? "<button class='ghost' data-act='phase' data-i='" + (pi - 1) + "'>이전 단계</button>" : "<span></span>") + (pi < 9 ? "<button class='ghost' data-act='phase' data-i='" + (pi + 1) + "'>다음 단계</button>" : "<span></span>") + "</div>");
  }
  function libSheet(k) {
    var h = "";
    if (k === "pledge") h = "<h2>선언문</h2><div class='pledge'>" + esc(D.PLEDGE) + "</div><button class='big-btn' data-act='copypledge'>복사</button>";
    else if (k === "debate") {
      var R = D.ROLES;
      h = "<h2>100차 토론</h2><p class='dim'>16개 역할이 10단계, 100판을 토론했습니다. ★ 인지심리학자·행동과학자·ADHD 임상의·투자 유치 전문가는 목소리를 높여 표결에서 2표씩, 나머지는 1표씩(모두 20표)입니다. 실제 인물이 아니라 각 분야의 관점을 제가 맡아 진행한 모의 토론이고, 근거는 주현 님 답변 80여 개입니다. 점선은 반대 의견을 내도록 일부러 부른 역할입니다.</p><div class='ppl'>" +
        Object.keys(R).filter(function (id) { return id !== "mod"; }).map(function (id) { var o = R[id]; return "<div class='pp" + (o[4] ? " loud" : "") + "'><span class='av" + (o[3] ? " opp" : "") + "' style='--c:" + o[2] + "'>" + o[1] + "</span><span>" + (o[4] ? "★ " : "") + o[0] + "</span></div>"; }).join("") + "</div>" +
        "<b class='blk'>100판으로 뒤집힌 것</b>" + D.FLIP.map(function (f) { return "<div class='flip'><small>" + esc(f[0]) + "</small><span class='old'>" + esc(f[1]) + "</span><b>→ " + esc(f[2]) + "</b></div>"; }).join("") +
        "<b class='blk'>10단계</b>" + D.PHASES.map(function (p, i) { return "<button class='row' data-act='phase' data-i='" + i + "'><span class='no'>" + (i + 1) + "</span><span><b>" + esc(p) + "</b><small>" + (i * 10 + 1) + "~" + (i * 10 + 10) + "번 · " + esc(D.ROUNDS[i * 10].t) + " 외</small></span></button>"; }).join("");
    }
    else if (k === "ifs") h = "<h2>만약 규칙 10개</h2><p class='dim'>목표만 정하면 잘 안 지켜지고, '만약 ~하면 ~한다'로 미리 정하면 훨씬 잘 지켜진다는 연구가 많아요(100차 토론 41번). 오늘 화면에 매일 하나씩 떠요.</p>" + D.IFS.map(function (f, i) { return "<div class='flip'><small>" + (i + 1) + "</small><b>만약 " + esc(f[0]) + ",</b><span>" + esc(f[1]) + ".</span></div>"; }).join("");
    else if (k === "decisions") h = "<h2>핵심 규칙 7개</h2><dl class='dec'>" + D.DEC.map(function (d) { return "<dt>" + esc(d[0]) + "</dt><dd>" + esc(d[1]) + "</dd>"; }).join("") + "</dl><p class='dim small'>100판의 결론을 일곱 줄로 줄였어요(95번). 1억의 정의는 아직 주현 님 답이 필요해요. 90일 동안 이 앱에는 기능을 더하지 않아요(94번).</p>";
    else if (k === "book") h = "<h2>교본 18장</h2>" + D.BOOK.map(function (c, i) { return "<button class='row' data-act='chapter' data-i='" + i + "'><span class='no'>" + (i + 1) + "</span><span><b>" + esc(c[0].replace(/^\d+\. /, "")) + "</b><small>" + esc(c[1][0].slice(0, 50)) + "…</small></span></button>"; }).join("");
    else if (k === "comics") h = "<h2>만화 10장면</h2><p class='dim'>파란 옷이 주현 님, 초록 옷이 모르는 사용자, 회색 옷이 동료입니다.</p>" + D.STRIPS.map(function (s, i) { return "<h3>" + (i + 1) + ". " + esc(s[0]) + "</h3>" + ART.strip(s) + "<p class='dim small'>" + esc(s[1]) + "</p>"; }).join("");
    else if (k === "figures") h = "<h2>그림 9장</h2>" + ART.figs.map(function (f) { return "<div class='fig'><h3>" + f[0] + "</h3>" + f[1] + "<p class='dim small'>" + f[2] + "</p></div>"; }).join("");
    else if (k === "swaps") h = "<h2>생각 바꾸기</h2>" + D.SWAPS.map(function (s) { return "<div class='flip'><span class='old'>" + esc(s[0]) + "</span><b>" + esc(s[1]) + "</b><small>근거: " + esc(s[2]) + "</small></div>"; }).join("") + "<p class='dim small'>말투 규칙 하나: 평가를 말하기 전에 질문을 하나 먼저 한다.</p>";
    else if (k === "spec") h = "<h2>납품 사양</h2><h3>위험 지도</h3><div class='fig'>" + ART.riskMap(D.RISKS) + "</div>" + D.RISKS.map(function (r) { return "<div class='risk'><b>" + r[0] + " · " + esc(r[1]) + "</b><small>먼저 보이는 신호: " + esc(r[4]) + "</small><span>대응: " + esc(r[5]) + "</span></div>"; }).join("") + "<h3>내놓기 전 점검 10항</h3><ol class='ol'>" + D.QA.map(function (q) { return "<li>" + esc(q) + "</li>"; }).join("") + "</ol>";
    else if (k === "all") { h = "<h2>90일 과제 전체</h2>"; for (var w = 0; w < 13; w++) { var wk = P.WK[w]; h += "<details class='fold'" + (Math.floor((Math.max(1, DN) - 1) / 7) === w ? " open" : "") + "><summary><span><b>" + (w + 1) + "주 차 · " + esc(wk[0]) + "</b><small class='dim'> " + esc(wk[1]) + "</small></span></summary><p class='dim small'>작업 " + esc(wk[7]) + " (" + wk[4] + "분) · 취침 " + esc(wk[3]) + " · 걷기 " + esc(wk[5]) + " · 숏폼 " + esc(wk[6]) + "</p>"; for (var d = w * 7 + 1; d <= Math.min(N, w * 7 + 7); d++) { var x = P.day(d); h += "<div class='drow" + (d === DN ? " now" : "") + "'><span class='dn'>D" + d + "</span><span><b>" + md(x.date) + "</b> <span class='tag " + (x.kind === "도구" ? "t-blue" : "t-coin") + "'>" + esc(x.kind) + "</span><br>" + esc(x.task) + "<small>글: " + esc(x.q) + "</small></span></div>"; } h += "</details>"; } }
    sheet(h);
  }

  /* ---------- 아이디어·무너짐 ---------- */
  function ideaSheet() {
    sheet("<h2>새 아이디어</h2><p class='dim'>적기만 해요. 2027-02-14까지 시작하지 않아요.</p><textarea id='ideaIn' class='ta' rows='3' placeholder='떠오른 것을 한 줄로'></textarea><input id='ideaWho' class='inp' placeholder='누가 돈을 내나? (꼭 적어요)'><button class='big-btn' data-act='saveidea'>주차장에 세우기</button><p class='dim small'>thinkingForMe에 로그인돼 있으면 '90일 작전 › 아이디어 주차장' 가지에 구상(씨앗)으로도 들어가요.</p>");
    setTimeout(function () { var i = $("#ideaIn"); if (i) i.focus(); }, 50);
  }
  function crashSheet() {
    sheet("<h2>오늘 무너졌어요</h2><p>괜찮아요. 오늘의 목표는 잘하는 게 아니라 끊기지 않는 거예요. 이유를 하나 골라 주세요.</p><div class='opts'>" +
      [["kid", "아이가 아파요"], ["family", "가족이 이번 주는 멈추자고 했어요"], ["work", "야근·회식이에요"], ["sleep", "잠을 못 잤어요"], ["just", "그냥 하기 싫어요"]].map(function (o) { return "<button class='ghost' data-act='why' data-k='" + o[0] + "'>" + o[1] + "</button>"; }).join("") + "</div>" +
      "<p class='dim small' style='margin-top:14px'>보호권 이번 달 " + frzLeft() + "장 남음. 쓰면 연속이 끊기지 않고, 3줄은 써야 해요.</p>" + (frzLeft() > 0 ? "<button class='ghost' data-act='freeze'>보호권 쓰기</button>" : "") +
      "<p class='dim small'>2주 넘게 기분이 계속 가라앉거나 잠이 무너지면 계획을 멈추고 처방의와 상의해요. 이 앱은 치료가 아니에요.</p>");
  }
  function crashAnswer(k) {
    var r = rec(TK), h;
    if (k === "kid" || k === "family") {
      r.ex = k === "kid" ? "아이가 아픈 날" : "가족이 멈추자고 한 날"; touch(TK); save();
      h = "<h2>오늘은 쉬는 날이에요</h2><p>연속 계산에서 빼 두었어요. 계획의 목적이 가족의 안전이니, 오늘은 계획대로 쉬는 거예요.</p><p class='dim'>할 수 있으면 자기 전에 3줄만 써요.</p>";
    } else {
      var tip = { work: "술은 0잔 그대로. 준비한 한 문장: '90일 동안 안 마시기로 해서요.'", sleep: "오늘은 취침 시각만 지켜요. 무너진 날의 원인은 대부분 전날 밤에 있어요.", just: "5분만 앉아요. 5분 뒤에 그만둬도 돼요. 대부분 이어서 하게 돼요." }[k];
      h = "<h2>최소 버전으로 가요</h2><ol class='how'><li>5분만 앉아 미션의 첫 줄만 한다</li><li>3줄 기록을 쓴다</li><li>끝. 연속은 살아 있어요</li></ol><p class='dim'>" + tip + "</p><button class='big-btn' data-act='min'>5분 했어요</button>";
    }
    sheet(h); render();
  }

  /* ---------- thinkingForMe 동기화 ---------- */
  function nodeRow(id, o) { return { id: id, kind: "node", data: Object.assign({ n: 1, st: 0, src: "p90", c: "90일 작전", s: "", d: "" }, o, { w: String(o.w || o.t).split(/\s+/)[0].slice(0, 8), t: String(o.t).slice(0, 140) }), updated_at: Date.now(), deleted: !!o.del }; }
  function queueNode(row) { nodeQ = nodeQ.filter(function (r) { return r.id !== row.id; }); nodeQ.push(row); lsSet(NQ, nodeQ); Sync.later(); }
  function noteNode(k) {
    var n = S.notes[k]; if (!n) return;
    var d = Math.floor((new Date(k) - START) / 864e5) + 1, x = d >= 1 && d <= N ? P.day(d) : null;
    var text = [n.a, n.l1 && "만들거나 올린 것: " + n.l1, n.l2 && "막힌 것: " + n.l2, n.l3 && "내일 첫 20분: " + n.l3].filter(Boolean).join("\n");
    if (!text) return;
    queueNode(nodeRow("p90j" + k.replace(/-/g, ""), { t: n.a || n.l1 || n.l2 || n.l3, s: x ? x.q : "", raw: text, g: x ? x.theme : "90일 기록", k: "기록", at: new Date(k).getTime() + 22 * 3600e3, del: n.map === false }));
  }
  function merge(a, b) {
    var o = { v: 2, pred: Object.assign({}, b.pred, a.pred), resv: Math.max(+a.resv || 0, +b.resv || 0), log: {}, notes: {}, ideas: [], gates: Object.assign({}, b.gates, a.gates), prep: Object.assign({}, b.prep, a.prep), u: Math.max(a.u || 0, b.u || 0) };
    ["log", "notes"].forEach(function (f) { var A = a[f] || {}, B = b[f] || {}; Object.keys(Object.assign({}, A, B)).forEach(function (k) { o[f][k] = !A[k] ? B[k] : !B[k] ? A[k] : ((A[k].t || 0) >= (B[k].t || 0) ? A[k] : B[k]); }); });
    var m = {}; (b.ideas || []).concat(a.ideas || []).forEach(function (i) { m[i.id] = m[i.id] && m[i.id].del ? m[i.id] : i; }); o.ideas = Object.keys(m).map(function (k) { return m[k]; }).sort(function (x, y) { return x.at - y.at; });
    return o;
  }
  var Sync = {
    sb: null, user: null, st: "이 기기에만 저장 중 (thinkingForMe 로그인 확인 중)", t: 0,
    paint: function () { var e = $("#syncSt"); if (e) e.textContent = this.st; var d = $("#syncDot"); if (d) d.className = "dot " + (this.user ? "ok" : ""); },
    init: function () {
      var me = this; if (!CFG.url) { me.st = "이 기기에만 저장 중"; return me.paint(); }
      var s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"; s.crossOrigin = "anonymous";
      s.onerror = function () { me.st = "서버에 닿지 못해 이 기기에만 저장 중"; me.paint(); };
      s.onload = function () {
        try { me.sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, detectSessionInUrl: false, flowType: "pkce" } }); } catch (e) { return; }
        me.sb.auth.getSession().then(function (r) {
          me.user = r.data && r.data.session && r.data.session.user;
          if (!me.user) { me.st = "thinkingForMe에 로그인돼 있지 않아 이 기기에만 저장 중. thinkingForMe에서 로그인하면 폰·PC가 맞춰져요."; return me.paint(); }
          return me.sb.from("think_items").select("data").eq("id", "p90").maybeSingle().then(function (q) {
            if (q.error) throw q.error;
            if (q.data && q.data.data && q.data.data.log) { S = merge(S, q.data.data); save(true); render(); }
            return me.push();
          });
        }).catch(function (e) { console.warn(e); me.st = "동기화하지 못해 이 기기에만 저장 중"; me.paint(); });
      };
      document.head.appendChild(s);
    },
    later: function () { var me = this; clearTimeout(me.t); me.t = setTimeout(function () { me.push(); }, 1200); },
    push: function () {
      var me = this; if (!me.sb || !me.user) return Promise.resolve();
      var uid = me.user.id, rows = [{ user_id: uid, id: "p90", kind: "p90", data: S, updated_at: Date.now(), deleted: false }].concat(nodeQ.map(function (r) { return Object.assign({ user_id: uid }, r); }));
      var sent = nodeQ.length;
      return me.sb.from("think_items").upsert(rows, { onConflict: "user_id,id" }).then(function (q) {
        if (q.error) throw q.error;
        nodeQ = nodeQ.slice(sent); lsSet(NQ, nodeQ);
        me.st = "thinkingForMe 계정에 저장됨 · " + new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) + " (폰·PC가 같은 기록)"; me.paint();
      }).catch(function (e) { console.warn(e); me.st = "서버에 올리지 못했어요. 이 기기에는 저장돼 있고 다음에 다시 올려요."; me.paint(); });
    }
  };

  /* ---------- 그리기·이벤트 ---------- */
  var TABS = [["today", "오늘"], ["journey", "여정"], ["records", "기록"], ["library", "자료"]], view = "today";
  function render() {
    var y = window.scrollY;
    $("#main").innerHTML = view === "today" ? viewToday() : view === "journey" ? viewJourney() : view === "records" ? viewRecords() : viewLibrary();
    document.querySelectorAll(".tabs button").forEach(function (b) { b.classList.toggle("on", b.dataset.go === view); if (b.dataset.go === view) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    window.scrollTo(0, y); Sync.paint();
  }
  function go(v) { view = v; if (location.hash !== "#" + v) history.replaceState(null, "", "#" + v); render(); window.scrollTo(0, 0); }
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act],[data-go]"); if (!t) { if (e.target.id === "sheet" || e.target.classList.contains("sheet-bg")) closeSheet(); return; }
    if (t.dataset.go) { closeSheet(); return go(t.dataset.go); }
    var a = t.dataset.act, r;
    if (a === "close") return closeSheet();
    if (a === "toggle") { r = rec(TK); r[t.dataset.k] = !r[t.dataset.k]; if (t.dataset.k === "work" && !r.work) r.min = false; touch(TK); save(); render(); if (r[t.dataset.k] && t.dataset.k === "work") toast("+2점 · 연속 " + streak("work") + "일"); return; }
    if (a === "step") { r = rec(TK); r[t.dataset.k] = Math.max(0, (+r[t.dataset.k] || 0) + (+t.dataset.d)); touch(TK); save(); render(); if (+t.dataset.d > 0) toast(t.dataset.k === "pub" ? "+10점 · 공개 사다리를 한 칸 더" : t.dataset.k === "rej" ? "+3점 · 거절 " + stats().rej + "/30, 주사위를 굴렸어요" : "+5점"); return; }
    if (a === "round") return sheet(roundHtml(+t.dataset.i));
    if (a === "chapter") { var c = D.BOOK[+t.dataset.i]; return sheet("<p class='eyebrow'>교본</p><h2>" + esc(c[0]) + "</h2><ul class='plain'>" + c[1].map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>"); }
    if (a === "lib") return libSheet(t.dataset.k);
    if (a === "day") return daySheet(+t.dataset.d);
    if (a === "late") { var k = dkey(+t.dataset.d); r = rec(k); r.work = true; touch(k); save(); closeSheet(); render(); return toast("그날을 만든 날로 고쳤어요"); }
    if (a === "crash") return crashSheet();
    if (a === "why") return crashAnswer(t.dataset.k);
    if (a === "min") { r = rec(TK); r.work = true; r.min = true; touch(TK); save(); closeSheet(); render(); return toast("최소 버전도 만든 날이에요"); }
    if (a === "unex") { r = rec(TK); delete r.ex; delete r.frz; touch(TK); save(); return render(); }
    if (a === "freeze") { r = rec(TK); r.frz = true; touch(TK); save(); closeSheet(); render(); return toast("보호권을 썼어요. 자기 전에 3줄만 써요"); }
    if (a === "timer") return tmrToggle();
    if (a === "resv") { S.resv = Math.max(0, (+S.resv || 0) + (+t.dataset.d)); save(); render(); if (+t.dataset.d > 0 && S.resv === 3) toast("예약 3건! 만들기로 넘어가요"); return; }
    if (a === "phase") return phaseSheet(+t.dataset.i);
    if (a === "idea") return ideaSheet();
    if (a === "saveidea") {
      var v = ($("#ideaIn").value || "").trim(), who = ($("#ideaWho").value || "").trim(); if (!v) return toast("한 줄만 적어 주세요"); if (!who) return toast("'누가 돈을 내나'를 한 줄 적어야 세울 수 있어요");
      var it = { id: Date.now().toString(36), text: v + (who ? " — 누가 돈을 내나: " + who : ""), at: Date.now() }; S.ideas.push(it); save();
      queueNode(nodeRow("p90i" + it.id, { t: v, raw: it.text, g: "아이디어 주차장", k: "구상", at: it.at }));
      closeSheet(); render(); return toast("주차장에 세웠어요. 2월 14일에 봐요");
    }
    if (a === "delidea") { S.ideas.forEach(function (i) { if (i.id === t.dataset.id) { i.del = true; queueNode(nodeRow("p90i" + i.id, { t: i.text, raw: i.text, g: "아이디어 주차장", k: "구상", at: i.at, del: true })); } }); save(); return render(); }
    if (a === "copyweek") return copy(weekText());
    if (a === "copypledge") return copy(D.PLEDGE);
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.dataset.gate) { S.gates[t.dataset.gate] = t.checked; save(); return; }
    if (t.dataset.prep) { S.prep[t.dataset.prep] = t.checked; save(); return; }
    if (t.dataset.pred != null) { S.pred = S.pred || {}; S.pred[t.dataset.pred] = +t.value; save(); return; }
    if (t.dataset.act === "mapnote") { var n = S.notes[TK] || (S.notes[TK] = {}); n.map = t.checked; n.t = Date.now(); save(); noteNode(TK); return; }
  });
  var noteTimer = 0;
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.dataset.num) { var r = rec(TK); r[t.dataset.num] = Math.max(0, parseInt(t.value, 10) || 0); touch(TK); save(); return; }
    if (t.dataset.note) {
      var n = S.notes[TK] || (S.notes[TK] = {}); n[t.dataset.note] = t.value; n.t = Date.now();
      var r2 = rec(TK), had = r2.log; r2.log = !!(n.a || n.l1 || n.l2 || n.l3); if (r2.log !== had) touch(TK);
      save(); clearTimeout(noteTimer); noteTimer = setTimeout(function () { noteNode(TK); if (r2.log && !had) render(); }, 1500);
    }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });
  window.addEventListener("hashchange", function () { var h = location.hash.slice(1); if (TABS.some(function (t) { return t[0] === h; })) { view = h; render(); } });
  window.addEventListener("focus", function () { var n = new Date(); n.setHours(0, 0, 0, 0); if (n - TODAY) location.reload(); });

  var h0 = location.hash.slice(1); if (TABS.some(function (t) { return t[0] === h0; })) view = h0;
  render(); Sync.init();
  window.P90 = { S: function () { return S; }, render: render };
})();
