/* art.js — 만화 컷과 도해(그림)를 SVG 문자열로 그림. 색은 페이지의 CSS 변수(--blue 등)를 씀. */
(function(){
var FIGS=[];
/* ---------- 만화 그리기 ---------- */
function person(x,mood,kind){
  var col=kind==="me"?"var(--blue)":kind==="user"?"var(--go)":"var(--muted)";
  var s="<rect x='"+(x-14)+"' y='80' width='28' height='38' rx='10' fill='"+col+"'/>"+
    "<circle cx='"+x+"' cy='62' r='16' fill='var(--card)' stroke='var(--ink)' stroke-width='2.5'/>";
  if(kind==="me")s+="<path d='M"+(x-16)+" 59 a16 16 0 0 1 32 0 q-16 -9 -32 0z' fill='var(--ink)'/>";
  if(kind==="user")s+="<circle cx='"+x+"' cy='43' r='6' fill='var(--ink)'/>";
  if(kind==="co")s+="<rect x='"+(x-17)+"' y='44' width='34' height='7' rx='3' fill='var(--ink)'/>";
  var er=mood==="shock"?3.2:2;
  s+="<circle cx='"+(x-6)+"' cy='63' r='"+er+"' fill='var(--ink)'/><circle cx='"+(x+6)+"' cy='63' r='"+er+"' fill='var(--ink)'/>";
  if(mood==="smile")s+="<path d='M"+(x-6)+" 69 q6 6 12 0' fill='none' stroke='var(--ink)' stroke-width='2' stroke-linecap='round'/>";
  else if(mood==="sad")s+="<path d='M"+(x-6)+" 74 q6 -6 12 0' fill='none' stroke='var(--ink)' stroke-width='2' stroke-linecap='round'/>";
  else if(mood==="shock")s+="<circle cx='"+x+"' cy='72' r='3' fill='var(--ink)'/>";
  else s+="<line x1='"+(x-5)+"' y1='72' x2='"+(x+5)+"' y2='72' stroke='var(--ink)' stroke-width='2' stroke-linecap='round'/>";
  return s}
function tw(t){return t.length*11+16}
function bubble(x,t){var w=Math.max(36,tw(t)),bx=Math.min(Math.max(x-w/2,3),197-w);
  return "<path d='M"+(x-5)+" 28 L"+x+" 40 L"+(x+5)+" 28z' fill='var(--card)' stroke='var(--ink)' stroke-width='1.5'/><rect x='"+bx+"' y='5' width='"+w+"' height='24' rx='11' fill='var(--card)' stroke='var(--ink)' stroke-width='1.5'/><rect x='"+(x-4)+"' y='26' width='8' height='4' fill='var(--card)'/><text x='"+(bx+w/2)+"' y='21' text-anchor='middle' font-size='11' font-weight='700'>"+t+"</text>"}
function sign(x,t){var w=tw(t),bx=Math.min(Math.max(x-w/2,3),197-w);
  return "<rect x='"+bx+"' y='66' width='"+w+"' height='28' rx='5' fill='var(--coin-soft)' stroke='var(--coin)' stroke-width='2'/><text x='"+(bx+w/2)+"' y='84' text-anchor='middle' font-size='11' font-weight='700'>"+t+"</text><line x1='"+(bx+w/2)+"' y1='94' x2='"+(bx+w/2)+"' y2='118' stroke='var(--coin)' stroke-width='2'/>"}
function prop(k,x,arg){
  switch(k){
  case "laptop":return "<rect x='"+(x-15)+"' y='96' width='30' height='19' rx='2' fill='var(--card)' stroke='var(--ink)' stroke-width='2'/><line x1='"+(x-9)+"' y1='103' x2='"+(x+9)+"' y2='103' stroke='var(--blue)' stroke-width='2'/><line x1='"+(x-9)+"' y1='108' x2='"+(x+3)+"' y2='108' stroke='var(--coin)' stroke-width='2'/><line x1='"+(x-20)+"' y1='117' x2='"+(x+20)+"' y2='117' stroke='var(--ink)' stroke-width='3' stroke-linecap='round'/>";
  case "phone":return "<rect x='"+(x-10)+"' y='82' width='20' height='34' rx='5' fill='var(--bad)'/><circle cx='"+(x-4)+"' cy='93' r='2.5' fill='var(--card)'/><circle cx='"+(x+4)+"' cy='93' r='2.5' fill='var(--card)'/><path d='M"+(x-5)+" 103 l2.5 3 l2.5 -3 l2.5 3 l2.5 -3' fill='none' stroke='var(--card)' stroke-width='1.5'/>";
  case "bulb":return "<circle cx='"+x+"' cy='72' r='12' fill='var(--coin)'/><rect x='"+(x-5)+"' y='83' width='10' height='7' rx='2' fill='var(--muted)'/><line x1='"+(x-20)+"' y1='72' x2='"+(x-15)+"' y2='72' stroke='var(--coin)' stroke-width='2'/><line x1='"+(x+15)+"' y1='72' x2='"+(x+20)+"' y2='72' stroke='var(--coin)' stroke-width='2'/><line x1='"+x+"' y1='52' x2='"+x+"' y2='57' stroke='var(--coin)' stroke-width='2'/>";
  case "coin":return "<circle cx='"+x+"' cy='98' r='15' fill='var(--coin)' stroke='var(--ink)' stroke-width='2'/><text x='"+x+"' y='102' text-anchor='middle' font-size='10' font-weight='700'>100</text>";
  case "box":return "<rect x='"+(x-20)+"' y='90' width='40' height='27' rx='3' fill='var(--warn-soft)' stroke='var(--warn)' stroke-width='2'/><line x1='"+(x-20)+"' y1='98' x2='"+(x+20)+"' y2='98' stroke='var(--warn)' stroke-width='2'/><text x='"+x+"' y='112' text-anchor='middle' font-size='10' font-weight='700'>주차장</text>";
  case "check":return "<circle cx='"+x+"' cy='84' r='15' fill='var(--go)'/><path d='M"+(x-7)+" 84 l5 6 l9 -11' fill='none' stroke='var(--card)' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'/>";
  case "cross":return "<path d='M"+(x-11)+" 84 l22 22 M"+(x+11)+" 84 l-22 22' stroke='var(--bad)' stroke-width='5' stroke-linecap='round'/>";
  case "clock":return "<circle cx='"+x+"' cy='78' r='15' fill='var(--card)' stroke='var(--ink)' stroke-width='2'/><path d='M"+x+" 69 v9 l6 4' fill='none' stroke='var(--ink)' stroke-width='2' stroke-linecap='round'/><text x='"+Math.min(x,172)+"' y='108' text-anchor='middle' font-size='10' font-weight='700'>"+arg+"</text>";
  case "cup":return "<path d='M"+(x-8)+" 92 h16 l-2 24 h-12z' fill='var(--warn-soft)' stroke='var(--warn)' stroke-width='2'/>";
  case "soda":return "<path d='M"+(x-7)+" 88 h14 l-1.5 28 h-11z' fill='var(--blue-soft)' stroke='var(--blue)' stroke-width='2'/><circle cx='"+(x-2)+"' cy='100' r='1.5' fill='var(--blue)'/><circle cx='"+(x+2)+"' cy='107' r='1.5' fill='var(--blue)'/>";
  }return ""}
function scene(tokens){
  var s="<rect width='200' height='140' fill='var(--bg)'/><line x1='0' y1='118' x2='200' y2='118' stroke='var(--line)' stroke-width='2'/>",top="";
  tokens.forEach(function(tk){var a=tk.split(":"),k=a[0],x=+a[1];
    if(k==="sun")s+="<circle cx='176' cy='24' r='12' fill='var(--coin)'/><path d='M176 6v-4M176 46v-4M158 24h-4M198 24h-4M163 11l-3-3M189 37l3 3M163 37l-3 3M189 11l3-3' stroke='var(--coin)' stroke-width='2'/>";
    else if(k==="moon")s+="<path d='M182 12 a13 13 0 1 0 6 22 a10 10 0 0 1 -6 -22z' fill='var(--blue)'/><circle cx='150' cy='14' r='1.5' fill='var(--muted)'/><circle cx='20' cy='20' r='1.5' fill='var(--muted)'/>";
    else if(k==="me"||k==="user"||k==="co")s+=person(x,a[2],k);
    else if(k==="say")top+=bubble(x,a.slice(2).join(":"));
    else if(k==="sign")s+=sign(x,a.slice(2).join(":"));
    else s+=prop(k,x,a.slice(2).join(":"))});
  return s+top}

function strip(st,small){var h="<div class='strip4"+(small?" sm":"")+"'>";
  st[2].forEach(function(pn,pi){h+="<div class='pn'><svg viewBox='0 0 200 140' role='img' aria-label='"+pn[0]+"'>"+scene(pn.slice(1))+"</svg><div class='cap'><span class='no'>"+(pi+1)+"</span>"+pn[0]+"</div></div>"});
  return h+"</div>"}
/* ---------- 그림(도해) ---------- */
function figure(title,svg,note){FIGS.push([title,svg,note||""])}
var ARW="<defs><marker id='ah' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='7' markerHeight='7' orient='auto-start-reverse'><path d='M0 0L10 5L0 10z' fill='context-stroke'/></marker></defs>";
function box(x,y,w,h,t,fill,stroke){return "<rect x='"+x+"' y='"+y+"' width='"+w+"' height='"+h+"' rx='8' fill='"+(fill||"var(--card)")+"' stroke='"+(stroke||"var(--ink)")+"' stroke-width='2'/><text x='"+(x+w/2)+"' y='"+(y+h/2+4)+"' text-anchor='middle' font-size='12' font-weight='700'>"+t+"</text>"}
function arr(x1,y1,x2,y2,col){return "<line x1='"+x1+"' y1='"+y1+"' x2='"+x2+"' y2='"+y2+"' stroke='"+(col||"var(--ink)")+"' stroke-width='2' marker-end='url(#ah)'/>"}
/* 1 위치 */
figure("① 지금 어디에 있는가","<svg viewBox='0 0 340 96' role='img' aria-label='0에서 1억까지의 눈금에서 지금 위치는 0.7'><line x1='20' y1='50' x2='320' y2='50' stroke='var(--line)' stroke-width='6' stroke-linecap='round'/><line x1='20' y1='50' x2='95' y2='50' stroke='var(--blue)' stroke-width='6' stroke-linecap='round'/>"+
 [[20,"0","시작"],[95,"0.7","지금"],[150,"1","첫 결제"],[205,"","매일 100원"],[262,"","월 300만"],[320,"","1억"]].map(function(m,i){return "<circle cx='"+m[0]+"' cy='50' r='"+(i===1?9:6)+"' fill='"+(i===1?"var(--coin)":i<1?"var(--blue)":"var(--card)")+"' stroke='var(--ink)' stroke-width='2'/><text x='"+m[0]+"' y='30' text-anchor='middle' font-size='13' font-weight='700'>"+m[1]+"</text><text x='"+Math.min(Math.max(m[0],24),312)+"' y='78' text-anchor='middle' font-size='10.5'>"+m[2]+"</text>"}).join("")+"</svg>","눈금 간격은 실제 거리와 비례하지 않습니다. 0.7에서 1까지가 가장 짧아 보이지만 지금까지 한 번도 넘지 못한 구간입니다.");
/* 2 고리 */
figure("② 반복되는 고리와 나가는 길","<svg viewBox='0 0 340 232' role='img' aria-label='아이디어, 만들기, 돌아감, 신기함이 사라짐으로 도는 고리와, 공개로 빠져나가 사용자와 첫 결제로 이어지는 길'>"+ARW+
 box(14,16,90,36,"새 아이디어")+box(125,16,90,36,"만든다")+box(236,16,90,36,"돌아간다")+
 box(70,92,130,36,"신기함이 사라진다","var(--bad-soft)","var(--bad)")+
 arr(104,34,123,34)+arr(215,34,234,34)+arr(262,52,202,96,"var(--bad)")+arr(92,92,62,54,"var(--bad)")+
 box(236,104,90,36,"공개한다","var(--go-soft)","var(--go)")+box(236,176,90,36,"모르는 사용자","var(--go-soft)","var(--go)")+box(70,176,130,36,"첫 결제 = 1","var(--go-soft)","var(--go)")+
 arr(296,52,296,102,"var(--go)")+arr(281,140,281,174,"var(--go)")+arr(236,194,202,194,"var(--go)")+
 "<text x='170' y='78' text-anchor='middle' font-size='11' fill='var(--bad)'>지금까지의 길</text><text x='300' y='160' font-size='11' text-anchor='start'></text></svg>","빨간 길이 지금까지 여덟 번 넘게 돈 고리입니다. '돌아간다'에서 초록 길로 내려가는 것이 90일의 전부입니다.");
/* 3 깔때기 */
figure("③ 첫 결제 한 건이 나오는 깔때기","<svg viewBox='0 0 340 190' role='img' aria-label='글을 본 사람 1000명, 눌러 본 사람 100명, 써 본 사람 10명, 결제 1명'>"+
 [[300,"글을 본 사람","1,000명","var(--blue-soft)"],[210,"눌러 본 사람","100명","var(--blue-soft)"],[130,"써 본 사람","10명","var(--coin-soft)"],[70,"결제","1명","var(--go-soft)"]].map(function(b,i){var x=(340-b[0])/2,y=8+i*46;return "<rect x='"+x+"' y='"+y+"' width='"+b[0]+"' height='36' rx='6' fill='"+b[3]+"' stroke='var(--ink)' stroke-width='1.5'/><text x='170' y='"+(y+16)+"' text-anchor='middle' font-size='11'>"+b[1]+"</text><text x='170' y='"+(y+30)+"' text-anchor='middle' font-size='12' font-weight='700'>"+b[2]+"</text>"}).join("")+"</svg>","단계마다 10명 중 1명이 넘어간다고 가정한 그림입니다. 실제 비율은 직접 재야 합니다. 결제 1건에 글을 본 사람이 약 1,000명 필요하다면, 채널 10곳에 올리는 이유가 여기에 있습니다.");
/* 4 1억 곡선 */
(function(){var v=[0,0,0,30,100,200,400,700,1000,1500,2500,3600],X=function(i){return 44+i*(286/11)},Y=function(n){return 165-n/3600*140};
 var pts=v.map(function(n,i){return X(i)+","+Y(n)}).join(" ");
 var g=[0,1000,2000,3000].map(function(n){return "<line x1='44' y1='"+Y(n)+"' x2='330' y2='"+Y(n)+"' stroke='var(--line)'/><text x='40' y='"+(Y(n)+4)+"' text-anchor='end' font-size='10'>"+n.toLocaleString()+"</text>"}).join("");
 var xl=[0,2,5,8,11].map(function(i){return "<text x='"+(i===11?334:X(i))+"' y='182' text-anchor='"+(i===11?"end":"middle")+"' font-size='10'>"+(i+1)+"개월</text>"}).join("");
 figure("④ 1년 1억으로 가는 곡선","<svg viewBox='0 0 340 190' role='img' aria-label='월 매출이 4개월 차 30만 원에서 12개월 차 3600만 원으로 오르는 곡선'>"+g+xl+"<polygon points='44,165 "+pts+" 330,165' fill='var(--coin-soft)'/><polyline points='"+pts+"' fill='none' stroke='var(--coin)' stroke-width='3' stroke-linejoin='round'/><circle cx='"+X(11)+"' cy='"+Y(3600)+"' r='5' fill='var(--coin)' stroke='var(--ink)' stroke-width='2'/><text x='"+(X(11)-8)+"' y='"+(Y(3600)+4)+"' text-anchor='end' font-size='11' font-weight='700'>3,600만 원</text><circle cx='"+X(2)+"' cy='165' r='5' fill='var(--blue)' stroke='var(--ink)' stroke-width='2'/><text x='"+X(2)+"' y='152' text-anchor='middle' font-size='10.5' font-weight='700'>90일: 첫 결제</text></svg>","세로축은 월 매출(만 원)입니다. 열두 달 합계가 약 1억 원이 되려면 이만큼 가파르게 올라야 합니다. 파란 점이 이번 90일의 끝입니다.")})();
/* 5 하루 고리 */
(function(){var r=58,C=2*Math.PI*r,off=0,segs=[[5.5,"var(--blue)"],[.17,"var(--line)"],[1.5,"var(--coin)"],[11.33,"var(--muted)"],[3,"var(--go)"],[.5,"var(--warn)"],[.5,"var(--line)"],[1.5,"var(--blue)"]];
 var arcs=segs.map(function(sg){var len=sg[0]/24*C,o="<circle cx='170' cy='95' r='"+r+"' fill='none' stroke='"+sg[1]+"' stroke-width='26' stroke-dasharray='"+len+" "+(C-len)+"' stroke-dashoffset='"+(-off)+"' transform='rotate(-90 170 95)'/>";off+=len;return o}).join("");
 var marks=[[0,"0시"],[6,"6시"],[12,"12시"],[18,"18시"]].map(function(m){var a=(m[0]/24*360-90)*Math.PI/180;return "<text x='"+(170+Math.cos(a)*88)+"' y='"+(95+Math.sin(a)*88+4)+"' text-anchor='middle' font-size='10.5'>"+m[1]+"</text>"}).join("");
 figure("⑤ 바꾼 하루 24시간","<svg viewBox='0 0 340 190' role='img' aria-label='24시간 고리: 수면 7시간, 새벽 작업 90분, 출근과 근무, 가족 3시간, 정리 30분'>"+arcs+marks+"<text x='170' y='92' text-anchor='middle' font-size='13' font-weight='700'>새벽</text><text x='170' y='108' text-anchor='middle' font-size='13' font-weight='700'>90분</text></svg><div class='legend'><span style='--c:var(--blue)'>수면 7시간</span><span style='--c:var(--coin)'>새벽 작업</span><span style='--c:var(--muted)'>출근·근무</span><span style='--c:var(--go)'>가족</span><span style='--c:var(--warn)'>정리</span></div>","노란 조각이 하루의 6%입니다. 이 조각 하나가 계획 전체를 움직입니다.")})();
/* 6 로드맵 */
(function(){var X=function(d){return 34+(d-1)*(296/89)};function bar(a,b,y,t,f){return "<rect x='"+X(a)+"' y='"+y+"' width='"+(X(b)-X(a))+"' height='24' rx='5' fill='"+f+"' stroke='var(--ink)' stroke-width='1.2'/><text x='"+((X(a)+X(b))/2)+"' y='"+(y+16)+"' text-anchor='middle' font-size='10' font-weight='700'>"+t+"</text>"}
 var gates=[[30,"30일","12/16"],[45,"45일","12/31"],[60,"60일","1/15"],[90,"90일","2/14"]].map(function(g){return "<line x1='"+X(g[0])+"' y1='22' x2='"+X(g[0])+"' y2='126' stroke='var(--bad)' stroke-width='1.5' stroke-dasharray='4 3'/><text x='"+Math.min(X(g[0]),318)+"' y='16' text-anchor='middle' font-size='10' font-weight='700'>"+g[1]+"</text><text x='"+Math.min(X(g[0]),318)+"' y='140' text-anchor='middle' font-size='9.5'>"+g[2]+"</text>"}).join("");
 figure("⑥ 90일 로드맵","<svg viewBox='0 0 340 146' role='img' aria-label='도구 트랙은 묻기, 만들기, 사용자와 첫 결제, 매일 100원 순서. 게임 트랙은 구상, 첫 버전, 공개와 개선, 판정 순서. 점검은 30일, 45일, 60일, 90일'><text x='4' y='52' font-size='10.5' font-weight='700'>도구</text><text x='4' y='98' font-size='10.5' font-weight='700'>게임</text>"+
 bar(1,13,36,"묻기","var(--blue-soft)")+bar(14,27,36,"만들기","var(--coin-soft)")+bar(28,62,36,"사용자·첫 결제","var(--go-soft)")+bar(63,90,36,"매일 100원","var(--coin-soft)")+
 bar(5,13,82,"구상","var(--blue-soft)")+bar(19,34,82,"첫 버전","var(--coin-soft)")+bar(40,62,82,"공개·개선","var(--go-soft)")+bar(68,90,82,"수익·판정","var(--coin-soft)")+gates+"</svg>","빨간 점선이 점검일입니다. 30일에 한쪽 숫자가 0이면 그 줄을 지웁니다.")})();
/* 7,8 흐름도 */
function flow(title,start,steps,end,note,aria){var h=58,H=44+steps.length*h+50,s="<svg viewBox='0 0 340 "+H+"' role='img' aria-label='"+aria+"'>"+ARW+box(60,4,150,30,start,"var(--blue-soft)");
 steps.forEach(function(st,i){var y=48+i*h;s+=arr(135,i?y-22:34,135,y-2)+box(30,y,210,34,st[0])+arr(240,y+17,262,y+17,"var(--bad)")+"<text x='251' y='"+(y+10)+"' text-anchor='middle' font-size='9.5' fill='var(--bad)'>"+st[1]+"</text><text x='266' y='"+(y+21)+"' font-size='10.5' font-weight='700'>"+st[2]+"</text><text x='141' y='"+(y+47)+"' font-size='9.5'>"+st[3]+"</text>"});
 var ye=48+steps.length*h;s+=arr(135,ye-22,135,ye-2)+box(40,ye,190,34,end,"var(--go-soft)","var(--go)")+"</svg>";figure(title,s,note)}
flow("⑦ 만들 만한 불편인지 가리는 순서","불편 하나",[["매주 한 번 이상 생기는가?","아니오","버린다","예"],["지금 돈이나 시간으로 때우는가?","아니오","버린다","예"],["'돈 내고라도' 글이 3개 있는가?","아니오","2순위로","예"]],"소개 한 장부터 올린다","세 질문을 모두 통과한 불편만 만듭니다. 하나라도 막히면 만들지 않습니다.","불편을 세 질문으로 거르는 흐름");
flow("⑧ 못 한 날의 순서","새벽에 못 했다",[["아이가 아프거나 집에 일이 있는가?","예","전부 쉰다","아니오"],["점심에 5분 앉을 수 있는가?","아니오","3줄만 쓴다","예"],["이틀 연속으로 못 했는가?","예","취침 시각 점검","아니오"]],"체크하고 내일 과제로 간다","밀린 과제는 따라잡지 않습니다. 언제나 오늘 날짜의 과제부터 합니다.","못 한 날에 따르는 흐름");
/* 9 주간 리듬 */
figure("⑨ 일주일의 리듬","<svg viewBox='0 0 340 120' role='img' aria-label='월요일부터 금요일은 도구 작업, 토요일과 일요일은 게임 60분, 걷기는 월 수 토, 일요일은 주간 보고'>"+["월","화","수","목","금","토","일"].map(function(d,i){var x=8+i*47,we=i>4;return "<rect x='"+x+"' y='8' width='42' height='100' rx='8' fill='"+(we?"var(--coin-soft)":"var(--blue-soft)")+"' stroke='var(--ink)' stroke-width='1.5'/><text x='"+(x+21)+"' y='26' text-anchor='middle' font-size='12' font-weight='700'>"+d+"</text><text x='"+(x+21)+"' y='48' text-anchor='middle' font-size='10.5'>"+(we?"게임":"도구")+"</text><text x='"+(x+21)+"' y='62' text-anchor='middle' font-size='10'>"+(we?"60분":"90분")+"</text>"+((i===0||i===2||i===5)?"<circle cx='"+(x+21)+"' cy='80' r='8' fill='var(--go)'/><text x='"+(x+21)+"' y='84' text-anchor='middle' font-size='9' font-weight='700' style='fill:var(--card)'>걷</text>":"")+(i===6?"<text x='"+(x+21)+"' y='98' text-anchor='middle' font-size='9.5' font-weight='700'>보고</text>":"")}).join("")+"</svg>","초록 동그라미가 걷는 날입니다. 일요일에는 숫자 넷을 올립니다.");


function riskMap(RISKS){var cell=84,ox=48,oy=10,used={},svg="<svg viewBox='0 0 340 300' role='img' aria-label='위험 10개를 일어날 가능성과 피해 크기로 배치한 지도'>";
 for(var i=0;i<3;i++)for(var j=0;j<3;j++){var sc=(i+1)*(3-j);svg+="<rect x='"+(ox+i*cell)+"' y='"+(oy+j*cell)+"' width='"+cell+"' height='"+cell+"' fill='"+(sc>=6?"var(--bad-soft)":sc>=3?"var(--warn-soft)":"var(--go-soft)")+"' stroke='var(--card)' stroke-width='2'/>"}
 RISKS.forEach(function(r){var key=r[2]+"-"+r[3],n=used[key]||0;used[key]=n+1;var cx=ox+(r[2]-1)*cell+22+(n%3)*22,cy=oy+(3-r[3])*cell+26+Math.floor(n/3)*26;svg+="<circle cx='"+cx+"' cy='"+cy+"' r='11' fill='var(--card)' stroke='var(--ink)' stroke-width='2'/><text x='"+cx+"' y='"+(cy+4)+"' text-anchor='middle' font-size='9.5' font-weight='700'>"+r[0]+"</text>"});
 ["낮음","보통","높음"].forEach(function(t,i){svg+="<text x='"+(ox+i*cell+cell/2)+"' y='278' text-anchor='middle' font-size='10.5'>"+t+"</text><text x='40' y='"+(oy+(2-i)*cell+cell/2+4)+"' text-anchor='end' font-size='10.5'>"+t+"</text>"});
 return svg+"<text x='"+(ox+cell*1.5)+"' y='295' text-anchor='middle' font-size='11' font-weight='700'>일어날 가능성</text><text x='10' y='"+(oy+cell*1.5)+"' font-size='11' font-weight='700' transform='rotate(-90 10 "+(oy+cell*1.5)+")' text-anchor='middle'>피해 크기</text></svg>"}
window.P90ART={strip:strip,figs:FIGS,riskMap:riskMap};
})();
