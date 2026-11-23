# 결제 · 로그인 2단계 — Apple 로그인 · RevenueCat 결제 · 서버 지급 (2026-11-23)

계획·결정은 `docs/MONETIZATION_PLAN.md`, 클라우드 저장 1단계는 `docs/CLOUD.md`. 이 문서는 **코드 구현 기록 + 제작자가 할 외부 설정 순서 + 상품 등록표**.

## 1. 무엇이 바뀌었나
| 영역 | 내용 | 파일 |
|---|---|---|
| Apple 로그인 | 설정 → "Apple로 연결": 지금 게스트 계정(Firebase 익명)에 Apple ID를 붙임 → **UID·서버 기록·결제 기록 그대로**. 이 Apple ID가 이미 다른 계정(예전 기기·재설치 전)에 있으면 "그 계정으로 바꿀까요?" → 바꾸면 이 기기 기록 / 서버 기록 고르기(이 기기가 처음 상태면 바로 서버 기록). 이름·이메일은 받지 않음 | `src/systems/appleAuth.ts`, `Cloud.ts`, `LobbyScene.ts` |
| 계정 삭제 | Apple 계정이면 Apple 창을 한 번 더 띄워 **Apple 토큰 해지**(애플 요구) → 서버 진행 기록 → 로그인 계정 → 기기 저장 순서로 삭제. 결제 장부는 법정 보관(5년) | `Cloud.ts` |
| 결제 | 상품 16종을 RevenueCat으로 구매·복원. 상점 루비 5종·패키지 3종·특혜 6종, 루비 충전 창, 패스 2종 버튼이 실제 결제로 동작(iOS 앱 + 설정 값이 있을 때만, 웹·토스는 "App Store 앱에서" 안내 그대로) | `src/systems/Purchases.ts`, `iosPurchases.ts`, `ShopScene.ts`, `PassScene.ts`, `src/ui/rubyShop.ts` |
| 서버 지급 | Cloud Functions(서울) 4개. **앱이 보낸 금액·영수증은 믿지 않고** 서버가 UID로 RevenueCat에 거래를 물어 확인한 것만 장부에 적고 지급 내용을 돌려줌 | `functions/src/index.ts`, 공용 상품표 `src/data/iap.ts` |
| 결제 전 안내 | 청약철회 제한·미성년자·서버 확인 후 지급 문구(상점·루비 충전·패스 공통 `PAY_NOTICE`) | `Purchases.ts` |
| 법 문서 초안 | 개인정보처리방침 v2·이용약관 v1(법률 검토 전, `[ ]`는 제작자 입력) | `docs/legal/` |
| iOS 설정 | Sign in with Apple 권한 파일 `App.entitlements`, SPM에 플러그인 2개 | `ios/App/` |

### 결제 흐름
```
상점 버튼 → ① iapCheck(서버: 이번 기간·계정당 구매 횟수, 패스는 이번 시즌 보유 여부) ─ 막히면 결제 창을 열지 않음
          → ② App Store 결제(RevenueCat SDK, 앱 사용자 ID = Firebase UID)
          → ③ iapSync(서버: RevenueCat REST로 이 UID 거래 조회 → 새 거래를 purchases/{스토어_거래ID}에 create — 같은 거래는 한 번만)
          → ④ 앱: 서버가 돌려준 "아직 안 받은 지급"만 저장(거래 ID로 한 번만) → ⑤ iapAck(받음 표시)
앱이 ③~⑤ 사이에 꺼지면 → 다음 실행·구매 복원·계정 전환 때 ③부터 다시 → 한 번만 지급
```
- 패키지·특혜·패스의 횟수 제한은 **결제 전에** 서버가 막는다. 확인과 결제 사이에 두 기기에서 동시에 사는 드문 경우는 돈을 냈으므로 지급하고 장부에 `overLimit: true`로 표시(운영 확인).
- 스킨 룰렛(11/24): 열쇠(`skin_key_1`)는 위 장부로 사고, **추첨은 서버** `skinSpin`(남은 열쇠 = 장부 열쇠 구매(환불 제외) − `skinRoulette/{uid}.spent`, 서버 난수, 기록 `skinSpins/{id}`) → 앱이 지급 저장 → `skinAck`. 룰렛 화면을 열면 `skinState`가 못 받은 추첨을 다시 돌려준다. 함수 3개가 늘었으니 **`firebase deploy --only functions` 다시 필요**.
- 환불: RevenueCat 웹훅(`rcWebhook`)이 장부에 `refunded: true` 기록, 아직 안 받은 지급은 더 주지 않음. **이미 준 재화 회수 규칙은 결정 대기**(아래 4절).
- 장부 문서는 앱(클라이언트)이 읽거나 쓸 수 없음(`firestore.rules` 기본 거부, 서버 관리자 SDK만).
- 한계(정직하게): 진행 저장은 아직 앱이 올리는 방식(1단계)이라 **기기 저장을 직접 고치는 조작은 막지 못함**. "결제로 받은 재화는 서버가 확인한 것만"은 지켜지고, 재화 전체를 서버가 계산하는 것은 3단계.

## 2. 제작자가 할 일 (순서대로 — AI가 대신할 수 없음)
1. **App Store Connect → 비즈니스(계약)**: 유료 앱 계약 동의 + 세금(W-8BEN 등) + 은행 계좌. "활성"이 돼야 결제가 동작.
2. **App Store Connect → 사용자 및 액세스 → 통합 → 인앱 구입**: 인앱 구입 키(.p8) 만들기 → 키 ID·발급자 ID와 함께 **RevenueCat → 프로젝트 → Apps → App Store 앱 추가**(번들 ID `com.dragonforce.app`)에 올림. 같은 화면의 "App Store Connect API" 키도 넣으면 상품 가져오기가 편해짐.
3. **App Store Connect → 앱 → 수익화 → 인앱 구입**: 아래 3절 17종 등록(유형 **소모품**, 상품 ID 그대로, 가격·한국어 이름·설명·심사용 스크린샷). 등록 후 "제출 준비 완료".
4. **RevenueCat → Products**: App Store에서 17종 가져오기(Import). 오퍼링·자격(entitlement)은 쓰지 않아도 됨(코드가 상품 ID로 직접 삼).
5. **RevenueCat → API keys**: ① App Store용 **공개 키**(`appl_…`) → `VITE_REVENUECAT_IOS_KEY` ② **비밀 키**(`sk_…`, v1) → 서버 비밀 값. 비밀 키는 채팅·저장소에 붙이지 말 것.
6. **Firebase 웹 앱 설정 4개** → `.env.local`(`.env.firebase.example` 복사) + Codemagic 환경 변수(아래 5개 모두 같은 이름).
   `VITE_FIREBASE_API_KEY` · `VITE_FIREBASE_AUTH_DOMAIN` · `VITE_FIREBASE_PROJECT_ID` · `VITE_FIREBASE_APP_ID` · `VITE_REVENUECAT_IOS_KEY`
7. **서버 함수 배포**(PowerShell, 저장소 폴더에서 — 처음 한 번 `npm i -g firebase-tools`):
   ```
   firebase login
   firebase functions:secrets:set REVENUECAT_SECRET_KEY      # 5-② 비밀 키 붙여 넣기
   firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH    # 아무 긴 무작위 문자열
   firebase deploy --only functions,firestore:rules
   ```
8. **RevenueCat → Integrations → Webhooks**: URL `https://asia-northeast3-dragon-force-eb552.cloudfunctions.net/rcWebhook`, Authorization 헤더 = 7의 `REVENUECAT_WEBHOOK_AUTH` 값.
9. **Firebase 콘솔 → Authentication → 설정 → 승인된 도메인**은 그대로(iOS는 기본 Apple 창이라 필요 없음). Apple 제공업체는 이미 켜짐(11/20).
10. Codemagic 빌드 → TestFlight → **샌드박스 테스터**(App Store Connect → 사용자 및 액세스 → 샌드박스)로 시험(6절).

## 3. App Store Connect 상품 등록표 (17종, 모두 소모품)
가격은 기획 값. App Store 가격 등급에 같은 금액이 없으면 가장 가까운 등급을 고르고 알려 주면 코드 표시 가격(`krw`)도 맞춤(앱 화면은 스토어 실제 가격을 우선 표시).

| # | 상품 ID | 이름 | 기획 가격 | 지급 | 구매 제한 |
|---|---|---|---|---|---|
| 1 | `ruby_100` | 루비 100 | ₩1,200 | 루비 100 | 없음 |
| 2 | `ruby_550` | 루비 550 | ₩5,900 | 루비 500+50 | 없음 |
| 3 | `ruby_1350` | 루비 1,350 | ₩11,000 | 루비 1,000+350 | 없음 |
| 4 | `ruby_2800` | 루비 2,800 | ₩22,000 | 루비 2,000+800 | 없음 |
| 5 | `ruby_7500` | 루비 7,500 | ₩55,000 | 루비 5,000+2,500 | 없음 |
| 6 | `pkg_growth_1` | 성장 지원 패키지 | ₩5,900 | 루비 500 · 골드 20,000 · 드래곤 개봉권 3 | 계정당 1 |
| 7 | `pkg_gear_1` | 장비 강화 패키지 | ₩11,000 | 루비 300 · 장비 개봉권 15 | 계정당 1 |
| 8 | `pkg_rune_1` | 룬 성장 패키지 | ₩11,000 | 루비 300 · 룬 개봉권 15 | 계정당 1 |
| 9 | `deal_daily_ruby` | 일일 루비 꾸러미 | ₩1,200 | 루비 150 · 골드 10,000 | 하루 1 (KST) |
| 10 | `deal_daily_summon` | 일일 소환 꾸러미 | ₩3,300 | 루비 100 · 드래곤 개봉권 2 | 하루 1 |
| 11 | `deal_weekly_growth` | 주간 성장 꾸러미 | ₩5,900 | 루비 600 · 골드 30,000 · 장비 개봉권 5 | 주 1 (월요일) |
| 12 | `deal_weekly_summon` | 주간 소환 꾸러미 | ₩11,000 | 루비 500 · 드래곤 개봉권 5 · 룬 개봉권 5 | 주 1 |
| 13 | `deal_monthly_res` | 월간 자원 상자 | ₩22,000 | 루비 2,500 · 골드 100,000 · 장비 10 · 룬 10 | 월 1 |
| 14 | `deal_monthly_summon` | 월간 소환 상자 | ₩33,000 | 루비 1,500 · 드래곤 개봉권 15 | 월 1 |
| 15 | `pass_premium_s` | 드래곤 패스 프리미엄 | ₩9,900 | 이번 시즌 프리미엄 줄 | 시즌당 1 |
| 16 | `pass_royal_s` | 드래곤 패스 로열 | ₩19,000 | 이번 시즌 프리미엄+로열 줄 | 시즌당 1 |
| 17 | `skin_key_1` | 스킨 룰렛 열쇠 | ₩4,900 | 스킨 룰렛 열쇠 1개 | 없음 (2026-11-23 밤 추가, `docs/SKINS.md`) |

- 표의 원본은 코드(`src/data/economy.ts` `RUBY_PRODUCTS`·`PACKAGES`·`DEALS`, `src/data/pass.ts` `PASS`). **상품 ID는 한 번 등록하면 바꿀 수 없음.**
- 패스·특혜를 "소모품"으로 둔 이유: 시즌·기간마다 다시 사는 상품이라 "비소모품"(한 번 사면 영구)과 맞지 않음. 한정 패키지 3종도 계정당 1회를 서버 장부로 지키므로 소모품으로 통일.

## 4. 결정 대기 (제작자)
1. **환불 때 이미 준 재화 회수**: 장부에는 기록됨. 회수 규칙(유료 루비에서 차감·모자라면 음수/구매 제한 등) 정하면 앱 반영 추가.
2. **패스: 프리미엄 산 뒤 로열** — 지금은 로열 전체 가격(₩19,000)을 다시 냄. 차액 업그레이드 상품(예: `pass_upgrade_s` ₩9,100)을 만들지?
3. **패스 결제 직후 시즌이 바뀐 경우**(시즌 마지막 몇 초): 지금은 산 시즌에만 적용, 다음 시즌으로 넘어가면 적용 안 됨(장부엔 남음 → 운영자가 보상 가능). 그대로 둘지?
4. 개인정보처리방침·약관의 `[ ]`(운영자·책임자 연락처·시행일) — 확정되면 `public/`으로 옮김. **지금 공개된 처리방침은 "서버·결제 없음" 기준이라 결제 출시 전에 꼭 바꿔야 함**(클라우드 저장을 켜는 순간부터도 해당).

## 5. 설정이 없을 때
- `VITE_FIREBASE_*` 없음 → 클라우드·Apple·결제 모두 꺼짐(기기 저장만, 지금처럼).
- `VITE_REVENUECAT_IOS_KEY` 없음 또는 웹·토스 → 결제 꺼짐(상점 "App Store 앱에서"), Apple 연결은 iOS면 동작.
- 서버 함수 미배포 → 결제 버튼에서 "결제는 App Store 앱에서"(구매 확인 실패) — 결제 창을 열지 않으므로 돈이 빠지지 않음.

## 6. TestFlight 시험 목록 (기획자 7항목 + 추가)
| # | 시험 | 기대 |
|---|---|---|
| 1 | 게스트로 진행 → Apple로 연결 | UID 그대로, 진행 유지, 설정에 "Apple 연결됨" |
| 2 | 다른 기기(또는 앱 삭제 후 재설치)에서 Apple로 연결 | "그 계정으로 바꿀까요?" → 바꾸기 → 서버 기록으로 이어 하기 |
| 3 | 루비 구매 직후 앱 강제 종료 → 다시 실행 | 실행 때 한 번 지급 |
| 4 | 같은 구매로 "구매 복원" 여러 번 | 추가 지급 없음 |
| 5 | 샌드박스 환불(App Store Connect → 샌드박스 → 환불 시험) | 장부 `refunded: true`, `iapEvents`에 기록 |
| 6 | 계정 삭제(Apple 계정) | Apple 창 → 삭제 → 새 게스트, 장부는 남음 |
| 7 | 비행기 모드에서 구매 | "인터넷 연결을 확인해 주세요", 결제 창 안 열림 |
| 8 | 일일 특혜 두 번째 구매 | "이번 기간에 살 수 있는 횟수를 모두 샀어요", 결제 창 안 열림 |
| 9 | 패스 프리미엄 구매 | 유료 줄 열림, 다시 누르면 "이미 가지고 있어요" |
| 10 | 결제 창에서 취소 | 아무 안내 없이 그대로 |

## 7. 테스트(자동)
`tests/iap.test.ts` 13개: 상품표 16종·ID 형식, 기간 키가 상점·패스 규칙과 일치(2026-11~2027-01 7시간 간격), 서버 구매 제한(루비 무제한·일일·계정당·패스 시즌·환불 제외), RevenueCat 응답 읽기, 서버 지급 반영(중복 1회·자정 넘김·패스 시즌), 결제 흐름(확인 실패 시 결제 창 안 열림·취소·ack 실패 재처리 한 번만). 서버 함수는 `npm --prefix functions run build`로 타입 검사·번들 확인(실제 동작은 배포 후 TestFlight).
