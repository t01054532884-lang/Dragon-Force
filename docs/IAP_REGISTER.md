# App Store Connect 인앱 상품 등록표 — 18종 (2026-11-26)

App Store Connect → 앱(드래곤 특공대, `com.dragonforce.app`) → **수익화 → 인앱 구입** → `+` 로 하나씩 만든다.
**상품 ID는 한 번 만들면 바꿀 수 없다** — 아래 값을 그대로 복사. 코드 원본: `src/data/iap.ts`(서버와 같이 씀), 가격·지급은 `src/data/economy.ts`·`pass.ts`·`rubyPass.ts`.

## 칸마다 넣을 것
| App Store Connect 칸 | 넣을 값 |
|---|---|
| 유형 | 아래 표의 "유형" (17종 소모품, 루비 패스만 비소모품) |
| 참조 이름(내부용) | 아래 표 "참조 이름" 그대로 |
| 상품 ID | 아래 표 그대로 |
| 가격 | 대한민국 원 가격 등급에서 표의 금액. 같은 금액이 없으면 가장 가까운 등급 → 알려 주면 코드 `krw`도 맞춤(앱 화면은 스토어 실제 가격을 먼저 보여 줌) |
| 판매 국가 | 전체(기본) |
| 현지화(한국어 + 영어(미국)) | 표시 이름(30자 이내) · 설명(45자 이내) — 아래 표 |
| 심사 정보 → 스크린샷 | 그 상품이 보이는 게임 화면 1장(상점 · 패스 · 루비 패스 · 스킨 룰렛 화면 캡처). 심사 메모: "상점/패스 화면에서 구매, 구매 즉시 지급" |
| 가족 공유 | 끔(소모품은 원래 없음) |

만든 뒤 각 상품이 **"제출 준비 완료"** 상태인지 확인 → 앱 버전 심사 제출 화면의 "인앱 구입 및 구독"에 **18개 모두 추가**해서 앱과 같이 제출.

## 18종

| # | 상품 ID | 유형 | 참조 이름 | 가격 | 한국어 표시 이름 · 설명 | English name · description | 구매 제한(서버) |
|---|---|---|---|---|---|---|---|
| 1 | `ruby_100` | 소모품 | Ruby 100 | ₩1,200 | 루비 100 · 루비 100개 | 100 Rubies · 100 rubies | 없음 |
| 2 | `ruby_550` | 소모품 | Ruby 550 | ₩5,900 | 루비 550 · 루비 500개 + 보너스 50개 | 550 Rubies · 500 rubies + 50 bonus | 없음 |
| 3 | `ruby_1350` | 소모품 | Ruby 1350 | ₩11,000 | 루비 1,350 · 루비 1,000개 + 보너스 350개 | 1,350 Rubies · 1,000 rubies + 350 bonus | 없음 |
| 4 | `ruby_2800` | 소모품 | Ruby 2800 | ₩22,000 | 루비 2,800 · 루비 2,000개 + 보너스 800개 | 2,800 Rubies · 2,000 rubies + 800 bonus | 없음 |
| 5 | `ruby_7500` | 소모품 | Ruby 7500 | ₩55,000 | 루비 7,500 · 루비 5,000개 + 보너스 2,500개 | 7,500 Rubies · 5,000 rubies + 2,500 bonus | 없음 |
| 6 | `pkg_growth_1` | 소모품 | Growth Package | ₩5,900 | 성장 지원 패키지 · 루비 500, 골드 2만, 드래곤 개봉권 3 | Growth Pack · 500 rubies, 20K gold, 3 dragon tickets | 계정당 1 |
| 7 | `pkg_gear_1` | 소모품 | Gear Package | ₩11,000 | 장비 강화 패키지 · 루비 300, 장비 개봉권 15 | Gear Pack · 300 rubies, 15 gear tickets | 계정당 1 |
| 8 | `pkg_rune_1` | 소모품 | Rune Package | ₩11,000 | 룬 성장 패키지 · 루비 300, 룬 개봉권 15 | Rune Pack · 300 rubies, 15 rune tickets | 계정당 1 |
| 9 | `deal_daily_ruby` | 소모품 | Daily Ruby Deal | ₩1,200 | 일일 루비 꾸러미 · 루비 150, 골드 1만 | Daily Ruby Deal · 150 rubies, 10K gold | 하루 1 (KST) |
| 10 | `deal_daily_summon` | 소모품 | Daily Summon Deal | ₩3,300 | 일일 소환 꾸러미 · 루비 100, 드래곤 개봉권 2 | Daily Summon Deal · 100 rubies, 2 dragon tickets | 하루 1 |
| 11 | `deal_weekly_growth` | 소모품 | Weekly Growth Deal | ₩5,900 | 주간 성장 꾸러미 · 루비 600, 골드 3만, 장비 개봉권 5 | Weekly Growth Deal · 600 rubies, 30K gold, 5 gear tickets | 주 1 (월요일) |
| 12 | `deal_weekly_summon` | 소모품 | Weekly Summon Deal | ₩11,000 | 주간 소환 꾸러미 · 루비 500, 드래곤 개봉권 5, 룬 개봉권 5 | Weekly Summon Deal · 500 rubies, 5 dragon + 5 rune tickets | 주 1 |
| 13 | `deal_monthly_res` | 소모품 | Monthly Resource Box | ₩22,000 | 월간 자원 상자 · 루비 2,500, 골드 10만, 장비·룬 개봉권 10씩 | Monthly Resource Box · 2,500 rubies, 100K gold, 10+10 tickets | 월 1 |
| 14 | `deal_monthly_summon` | 소모품 | Monthly Summon Box | ₩33,000 | 월간 소환 상자 · 루비 1,500, 드래곤 개봉권 15 | Monthly Summon Box · 1,500 rubies, 15 dragon tickets | 월 1 |
| 15 | `pass_premium_s` | 소모품 | Dragon Pass Premium | ₩9,900 | 드래곤 패스 프리미엄 · 이번 시즌 프리미엄 보상 30칸 | Dragon Pass Premium · Premium rewards for this season | 시즌(28일)당 1 |
| 16 | `pass_royal_s` | 소모품 | Dragon Pass Royal | ₩19,000 | 드래곤 패스 로열 · 이번 시즌 프리미엄 + 로열 보상 | Dragon Pass Royal · Premium + Royal rewards this season | 시즌당 1 |
| 17 | `skin_key_1` | 소모품 | Skin Roulette Key | ₩4,900 | 스킨 룰렛 열쇠 · 스킨 룰렛 1회 | Skin Roulette Key · 1 skin roulette spin | 없음 |
| 18 | `ruby_pass_1` | **비소모품** | Ruby Pass | ₩25,000 | 루비 패스 · 계정 레벨 30까지 루비 보상 줄 열기 | Ruby Pass · Unlocks ruby rewards up to account Lv.30 | 계정당 1 |

### 유형을 이렇게 정한 이유
- **소모품 17종**: 루비·꾸러미는 받으면 사라지는 재화, 패스는 시즌(28일)마다 다시 사는 상품, 한정 패키지는 계정당 1회를 서버 장부가 지킴(`docs/PAYMENTS.md` 3절).
- **루비 패스만 비소모품(AI 권장)**: 한 번 사면 계속 유지되는 "영구 해제"라, 애플 심사 지침 3.1.1의 "복원 가능해야 하는 구매"에 해당. 비소모품이어야 기기를 바꿔도 "구매 복원"으로 되살아난다. 서버 장부·RevenueCat은 비소모품도 같은 거래 기록으로 처리(코드 변경 없음).
  - 소모품으로 통일하고 싶으면 그래도 동작은 하지만(서버가 계정당 1회를 막음), 심사에서 "복원 안 되는 영구 상품"으로 지적될 수 있음.

## 등록 뒤 순서(요약)
1. RevenueCat → Products → App Store에서 **18종 가져오기(Import)**.
2. RevenueCat 공개 키 → Codemagic `VITE_REVENUECAT_IOS_KEY`, 비밀 키 → `firebase functions:secrets:set REVENUECAT_SECRET_KEY`(지금 임시 값) → 함수 다시 배포.
3. RevenueCat → Webhooks: `https://rcwebhook-3ovvizgaya-du.a.run.app` (11/26 배포 때 나온 주소) + Authorization 헤더.
4. Codemagic 빌드 → TestFlight → 샌드박스 계정으로 루비 1개·패스 1개·루비 패스·스킨 열쇠·구매 복원 시험.
