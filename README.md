# thinkingForMe

내가 말한 **생각·의견·사업구상**을 매우 심플하게부터 세세하게까지 보는 개인 사이트입니다.
서버 없이 GitHub Pages 하나로 돌아가고, 기록·로그인·알림은 자판기·플래너와 같은 Supabase 프로젝트(vendingforme)를 씁니다.

- 주소: https://jeffreryinko.github.io/thinkingForMe/
- 허용된 구글 계정 하나만 로그인할 수 있습니다(서버의 행 보안으로 막음). 코드는 공개지만 생각 데이터는 로그인해야만 읽힙니다.

## 화면 (탭 4개)

| 탭 | 무엇 |
|---|---|
| 홈 | 만트라 · 오늘 연 횟수(목표 5번)와 쌓인 수 · 다시 꺼내 본 생각(2주 넘은 내 생각 하나, '다른 생각'으로 바꿈) · 실행을 기다리는 구상 · 부딪히는 생각 · 자주 돌아오는 생각 · 최근 생각 |
| 지도 | 가운데 '나의 생각'에서 왼쪽·오른쪽으로 퍼지는 마인드맵. 대분류 → 주제 → 생각(작은 사진 + 한 줄). 가지를 누르면 펼쳐지며 그쪽으로 다가감. 폰은 끌기·두 손가락 확대, PC는 끌기·휠 확대(터치패드는 두 손가락 이동)·+ − 0 키 |
| 흐름 | 날짜순 · 주제별(주제 하나의 생각이 시간순으로) · 줄기(서로 이어진 생각이 처음부터 어떻게 번졌는지) |
| 회고 | 쌓여 온 곡선 · 14일 사용 횟수 · 분류별 분포 · AI 주간 회고 |

위쪽 **단어 · 한 줄 · 요약 · 상세 · 원문** 버튼이 모든 화면에 함께 적용됩니다. 밝게·어둡게는 위쪽 달 모양 버튼.

### 생각 창
사진 · 분류 · 본문 · **세 관점과 사람들의 욕구**(투자자·고객·경쟁자·욕구 네 칸, 결과는 그 생각에 저장되고 어느 AI가 언제 평가했는지 표시) · AI로 정리 · 줄기 보기 · 플래너로 보내기 · 이어진 생각 · 고치기·그림·잠금·지우기

### 뒤로가기
창 닫기 → 이전 창 → 홈 순서로만 움직이고, 홈에서 더 눌러도 사이트 밖으로 나가지 않습니다.

## AI — 버튼을 누를 때만

설정에 키를 넣으면 켜집니다. 일에 따라 먼저 부르는 AI가 다르고, 키가 없거나 막히면 다음 AI가 대신합니다.

| 일 | 순서 |
|---|---|
| AI로 정리 | Gemini → Grok → Claude |
| 세 관점과 욕구 | Claude → Grok → Gemini |
| 주간 회고 | Claude → Gemini → Grok |
| 질문하기·만트라 후보 | Grok → Gemini → Claude |

Claude·Grok은 응답의 토큰 수로 금액을 추정해 `settings.spend[YYYY-MM]`에 쌓습니다. 월 한도(기본 20달러)의 80%에서 알림, 100%가 되면 Claude·Grok은 멈추고 Gemini만 씁니다. 단가(백만 토큰당 달러)는 `app.js`의 `PROV`에 있습니다(Claude 3/15, Grok 0.2/0.5).

## 기록의 모양

표 `think_items` 한 줄 = `{ id, kind, data, updated_at, deleted }`

| kind | data |
|---|---|
| `node` | t(한 줄) w(단어) s(요약) d(상세) raw(원문) c(대분류) g(연결 주제) k(생각·의견·구상·자료·기록) at n(횟수) st(단계) needs[] v{inv,cus,com,need} hist[] p(잠금) next todo[] ph th(작은 사진) img imgSrc kw(사진 검색어) url |
| `link` | a, b, r(rel·contra), why, by(ai·me) |
| `photo` | img (줄인 JPEG) |
| `use` | n(그날 사용 횟수), adds |
| `review` | text, by(쓴 AI) |
| `settings` | mantra, notis[{id,kind,time,days,on}], gkey·xkey·ckey(키), gmodel·xmodel·cmodel, cap(월 한도), spend{달: {claude, grok}}, pin |

## Supabase (끝남, 2026-11-14)

기존 `vendingforme` 프로젝트에 **추가만** 했습니다 — 마이그레이션 `thinkingforme_init`.
- 표 `think_items`, `think_push_subs` (본인 + 허용 계정만), 비공개 `think_private.owner`(허용 이메일) · `think_private.sent`
- 함수 `think_is_owner()`, `think_push_test()`, `think_private.tick()`
- 예약 작업 `think-tick`(5분마다 알림 확인), `think-tidy`(하루 한 번 청소)
- 알림 발송은 플래너의 Edge Function `planner` 를 함께 씁니다. 알림 시각은 5분 단위입니다.
- 허용 계정을 바꾸려면 `think_private.owner` 의 이메일을 바꿉니다.

## 자판기 연동

열 때마다 자판기의 기록을 읽어 새 것만 `자판기에서` 가지로 가져옵니다(읽기만 함): 보관함의 질문(`vfm:box:qs`)과 생각(`vfm:box:think`), 각 앱의 별표·메모(`vfm:<앱>:star`·`memo`), 좋아요(`vfm:likes`). 같은 주소라 이 기기의 기록은 바로 읽고, 다른 기기의 것은 자판기가 올려 둔 `kv` 표에서 읽습니다. 가져온 뒤 여기서 지운 것은 다시 들어오지 않습니다. 자판기 첫 화면의 "생각 지도" 버튼으로 이쪽으로 넘어옵니다.

## 플래너 연동

생각을 열어 **✅ 플래너로** 를 누르면 `planner_items` 에 할 일(`task`, 태그 `생각`)이 바로 들어갑니다. 한 달 퀘스트는 그 기기 브라우저에만 저장되는 구조라 바로가기만 있습니다.
