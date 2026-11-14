# thinkingForMe

내가 말한 **생각·의견·사업구상**을 매우 심플하게부터 세세하게까지 보는 개인 사이트입니다.
서버 없이 GitHub Pages 하나로 돌아가고, 기록·로그인·알림은 자판기·플래너와 같은 Supabase 프로젝트(vendingforme)를 씁니다.

- 주소: https://jeffreryinko.github.io/thinkingForMe/
- 허용된 구글 계정 하나만 로그인할 수 있습니다(서버의 행 보안으로 막음). 코드는 공개지만 생각 데이터는 로그인해야만 읽힙니다.

## 화면

| 탭 | 무엇 |
|---|---|
| 오늘 | 만트라 · 오늘 사용 횟수(목표 5회)와 연속 일수 · 자주 돌아오는 생각 · 서로 부딪히는 생각 · 최근 생각 |
| 우주 | 연결 그래프. 별 = 생각, 크기 = 떠올린 횟수, 밝기 = 단계(씨앗→새싹→나무), 붉은 점선 = 부딪히는 생각. ▶ 성장 재생 |
| 가지 | 마인드맵. 나 → 대분류 → 연결 주제 → 생각 |
| 흐름 | 타임라인 |
| 회고 | 누적 그래프 · 14일 사용 횟수 · 분류별 분포 · 주간 회고 |

위쪽 **깊이 막대**(단어 → 한 줄 → 요약 → 상세 → 원문)가 모든 화면에 함께 적용됩니다.
아래 칸에 한 줄 적으면 별이 하나 생기고, 거의 같은 생각이면 기존 별과 합쳐져 횟수(×n)가 올라갑니다.

## AI (Gemini) — 버튼을 누를 때만

설정에 Gemini API 키를 넣으면 켜집니다(aistudio.google.com 에서 무료 발급).
- ✨ AI 정리: 단어·한 줄·요약·상세·분류·욕구 태그·연결/모순 제안
- 👥 세 관점·욕구: 투자자·고객·경쟁자 시선과 사람들 욕구(추정)
- 내 생각에 질문하기 · AI 회고 · 만트라 후보

## 기록의 모양

표 `think_items` 한 줄 = `{ id, kind, data, updated_at, deleted }`

| kind | data |
|---|---|
| `node` | t(한 줄) w(단어) s(요약) d(상세) raw(원문) c(대분류) g(연결 주제) k(생각·의견·구상·자료·기록) at n(횟수) st(단계) needs[] v{inv,cus,com,need} hist[] p(잠금) next todo[] ph |
| `link` | a, b, r(rel·contra), why, by(ai·me) |
| `photo` | img (줄인 JPEG) |
| `use` | n(그날 사용 횟수), adds |
| `review` | text |
| `settings` | mantra, notis[{id,kind,time,days,on}], gkey, gmodel, pin |

## Supabase (끝남, 2026-11-14)

기존 `vendingforme` 프로젝트에 **추가만** 했습니다 — 마이그레이션 `thinkingforme_init`.
- 표 `think_items`, `think_push_subs` (본인 + 허용 계정만), 비공개 `think_private.owner`(허용 이메일) · `think_private.sent`
- 함수 `think_is_owner()`, `think_push_test()`, `think_private.tick()`
- 예약 작업 `think-tick`(5분마다 알림 확인), `think-tidy`(하루 한 번 청소)
- 알림 발송은 플래너의 Edge Function `planner` 를 함께 씁니다. 알림 시각은 5분 단위입니다.
- 허용 계정을 바꾸려면 `think_private.owner` 의 이메일을 바꿉니다.

## 플래너 연동

생각을 열어 **✅ 플래너로** 를 누르면 `planner_items` 에 할 일(`task`, 태그 `생각`)이 바로 들어갑니다. 한 달 퀘스트는 그 기기 브라우저에만 저장되는 구조라 바로가기만 있습니다.
