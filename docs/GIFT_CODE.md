# 선물 코드 (Apple 오퍼 코드, 1.0.5 — 2026-11-28 제작자 승인)

## 왜 Apple 오퍼 코드인가
App Store 가이드라인 3.1.1: 게임 재화를 앱 자체 방식(키·QR 코드 등)으로 열면 안 되고 IAP로 해야 함 → 자체 코드 입력은 반려 위험. Apple 공식 **오퍼 코드**를 씀(소모성 IAP 지원, 코드별 사용 횟수 제한, 고객당 오퍼 1회는 Apple이 막음).

## 구현
| 곳 | 내용 |
|---|---|
| `src/data/iap.ts` | 소모성 상품 **`ruby_2000_gift`**(kind `gift`, 0원, 루비 2,000). 상점 목록(RUBY_PRODUCTS)에는 없음 — 오퍼 코드로만 받음 |
| `functions/src/index.ts` iapSync | 기존 거래 장부 그대로. `paidRubies`는 선물 코드면 0(무료 루비) |
| `src/systems/Purchases.ts` | `applyServerGrant` → `grantGiftCode`: 루비를 바로 넣지 않고 **선물함에 "선물 코드 보상 루비 2,000"**(만료 없음). 같은 거래는 한 번만(거래 기록 `gift:<거래 ID>` + 선물 id `giftcode:<거래 ID>`) |
| `src/systems/iosPurchases.ts` | `redeemCode` = RevenueCat `Purchases.presentCodeRedemptionSheet()`(iOS 14+) |
| `src/scenes/LobbyScene.ts` 설정 | **"선물 코드"** 버튼 + 안내(한·영). iOS에서 결제가 켜져 있을 때만 — 웹·토스·안드로이드는 숨김. 누르면 Apple 코드 창 → 닫힌 뒤 3·8·20초에 지급 확인 → 받으면 "선물함에 도착" 안내 |

안내 문구: "SNS에 공개되는 오늘의 코드를 입력하면 루비 2,000개. 코드마다 선착순 정해진 인원, Apple 계정당 1회. 이 이벤트는 드래곤 특공대가 진행하며 Apple은 후원·관련이 없습니다."

## 앱이 꺼져 있을 때 쓴 코드
App Store 앱(또는 링크)에서 직접 코드를 쓰면 거래가 Apple에 생기고, 다음 실행 때 RevenueCat SDK가 거래를 올림 → 앱 시작 시 `installIosPurchases`가 `deliverPending()`을 부름 → 서버 iapSync가 RevenueCat에서 그 거래를 읽어 장부에 적고 → 선물함에 들어감. 기존 "미지급 거래" 처리와 같은 길이라 따로 할 것 없음.

## 관리자팀이 할 것(App Store Connect·RevenueCat)
1. App Store Connect: 소모성 상품 `ruby_2000_gift` 만들기(가격 등급은 아무거나 — 오퍼 코드는 무료로 지급), 심사용 스크린숏은 설정 창.
2. 그 상품에 **오퍼 코드** 만들기(코드별 사용 횟수, 기간). 일회용 코드 또는 사용자 지정 코드.
3. RevenueCat 대시보드: 상품 `ruby_2000_gift` 추가(다른 루비 상품처럼 non-subscription). 오퍼링에는 넣지 않아도 됨(앱은 오퍼링을 쓰지 않음).
4. 상품 ID가 다르면 개발팀에 알려 주기(`GIFT_CODE.productId` 한 곳만 바꾸면 됨).

## TestFlight에서 확인하는 법(sandbox)
1. App Store Connect에서 오퍼 코드를 만들 때 **테스트용 코드**를 함께 만든다(오퍼 코드는 TestFlight·sandbox 계정에서도 사용 가능).
2. TestFlight 빌드 설치 → 설정 → "선물 코드" → Apple 창에 코드 입력 → 완료.
3. 몇 초 안에 "선물 코드 보상 루비 2,000개가 선물함에 도착했어요" → 선물함에서 받기 → 루비 +2,000.
4. 같은 코드를 다시 쓰면 Apple 창이 막음(계정당 1회). 앱을 끄고 App Store 앱 → 계정 → "기프트 카드 또는 코드 사용"으로 다른 코드를 쓴 뒤 앱을 켜면 선물함에 들어오는지 확인.
5. Firebase 콘솔 iapLedger에 `productId: ruby_2000_gift`, `paidRubies: 0` 문서가 생기는지 확인.

## 확인한 것
- 테스트 `tests/giftcode.test.ts`(5개): 상품·서버 읽기·선물함 지급·같은 거래 한 번·다른 거래 각각. 전체 318개.
- 설정 창 배치: 웹 개발 주소 `?dev=1&giftcode=1`로 확인(웹에서는 누르면 아무 일 없음).
- 실제 Apple 코드 창·지급은 TestFlight에서만 확인 가능(아직 안 함).
