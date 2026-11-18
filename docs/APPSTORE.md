# App Store 출시 준비 (토스보다 먼저 — 제작자 결정 2026-11-18)

## 지금 상태
| 항목 | 상태 |
|---|---|
| iOS 프로젝트 | ✅ Capacitor 8 · `com.dragonforce.game` · 아이폰 전용 · 세로 고정 · 전체 화면 · 상태 표시줄 숨김 · 한국어 |
| 시작 화면 | ✅ Capacitor 기본(흰 배경 + 로고) → 게임 배경색 단색 |
| 개인정보 매니페스트 | ✅ `ios/App/App/PrivacyInfo.xcprivacy`: 추적 없음, 수집 없음, UserDefaults 사용 이유 CA92.1(진행 저장). Capacitor 코어는 자체 매니페스트가 있고 Preferences 플러그인은 없어서 앱에서 신고 |
| 암호화 수출 질문 | ✅ `ITSAppUsesNonExemptEncryption = false`(업로드마다 묻지 않음) |
| 앱 아이콘 | ⚠️ 임시(게임 속 레드 드래곤 도형, `scripts/make_placeholder_icon.py`). 기획자 그림(`docs/ART_REQUEST.md` 1번)으로 교체 |
| 처리방침 · 지원 URL | ✅ 페이지 있음(`public/privacy.html`, `public/support.html`). **GitHub Pages를 켜야 주소가 생김** |
| 빌드·업로드 | ✅ `codemagic.yaml`. Apple ID(숫자)만 채우면 됨 |
| 스크린샷 | ❌ 게임 화면 캡처로 제작 예정(6.9인치 1320×2868 또는 6.5인치 1284×2778, 3~10장) |

## ⚠️ 심사에서 걸릴 수 있는 것 (먼저 알아 둘 것)
1. **"준비 중" 화면(2.1 완성도 · 2.2 베타·데모 금지)**: v1.2는 2~20단계를 "준비 중"으로 보여 준다. 애플은 미완성·자리표시 콘텐츠가 보이는 앱을 반려하는 경우가 있다. **App Store 빌드에서는 아직 없는 단계를 목록에서 숨기거나, 출시 전에 단계를 더 채우는 것**을 권한다. → v1.2 작업 세션과 맞출 것.
2. **콘텐츠 양(4.2 최소 기능)**: 웹 게임을 앱에 넣은 구조 자체는 문제없지만(파일을 앱 안에 넣음), 플레이할 단계가 1개뿐이면 "너무 적다"는 판단을 받을 수 있다. 영구 성장·드래곤 10종·장비·상점이 있으니 심사 메모에 반복 플레이 구조를 설명한다.
3. **무작위 상자**: 현재는 루비를 게임 안에서만 얻는다(유료 결제 없음). 그래도 확률 공개 화면은 유지한다. 나중에 루비를 팔면 애플 인앱결제만 쓰고, 구매 전에 확률을 보여 줘야 한다(3.1.1).
4. **연령 등급 설문**: "무작위 보상(상자·소환)이 있다 / 실제 돈으로 살 수 없다 / 판타지 폭력(드래곤이 마수와 싸움, 피 없음)"을 사실대로 답한다. 어떤 등급이 나오는지는 설문 결과를 따른다(미리 단정하지 않음).
5. **개발용 기능**: `?dev=1` 초기화·개발 버튼은 배포 빌드에서 꺼져 있다(`import.meta.env.DEV`). 앱 안에서 켜는 길이 없는지 출시 전 한 번 더 확인.

## App Store Connect 입력 초안 (제작자가 고쳐서 쓰기)
- **이름(30자)**: 드래곤 특공대
- **부제(30자)**: 마수를 물리치는 드래곤 서바이벌
- **카테고리**: 게임 > 액션 (보조: 롤플레잉)
- **프로모션 텍스트(170자)**: 8분 동안 쏟아지는 마수를 견디고, 엘리트와 보스를 쓰러뜨려 드래곤의 성지를 되찾으세요.
- **설명**:
  > 레드 드래곤이 되어 검은 왕관의 파편에 오염된 마수들을 물리치세요.
  >
  > • 한 손 조작: 화면을 끌어 움직이면 드래곤이 알아서 공격합니다.
  > • 매 판 새로운 빌드: 레벨업마다 스킬 3장 중 하나를 골라 나만의 조합을 만드세요. 화염 브레스, 번개 숨결, 드래곤 메테오…
  > • 8분의 전투: 몰려오는 마수, 1분 40초와 3분 40초의 엘리트, 5분 50초의 보스. 시간 안에 보스를 쓰러뜨리면 성지 탈환!
  > • 영구 성장: 전투에서 모은 골드로 드래곤 성장 연구소를 강화하고, 드래곤 10종을 모아 키우세요.
  > • 공정한 확률: 상자·소환 확률과 보장 규칙을 게임 안에서 모두 공개합니다.
  >
  > 개인정보를 수집하지 않으며, 진행 상황은 기기 안에만 저장됩니다.
- **키워드(100자, 쉼표)**: 드래곤,로그라이크,서바이벌,액션,슈팅,판타지,보스,마수,한손게임,오프라인,자동공격
  - 다른 게임 이름(상표)이나 특정 게임을 떠올리게 하는 말은 키워드에 넣지 않는다(심사 2.3.7).
- **지원 URL**: https://t01054532884-lang.github.io/Dragon-Force/support.html
- **개인정보처리방침 URL**: https://t01054532884-lang.github.io/Dragon-Force/privacy.html
- **저작권**: © 2026 오준수
- **앱 개인정보(영양 라벨)**: "데이터를 수집하지 않음"
- **심사 메모(영문)**:
  > Single-player offline action game. No account, no login, no in-app purchases, no ads, no data collection. Drag anywhere on the screen to move; attacks are automatic. Progress is stored on device only. Random reward boxes use in-game currency earned by playing; odds are disclosed in the shop ("확률 보기").

## 제작자가 할 일 (순서)
1. GitHub 저장소 Settings → Pages → Source "GitHub Actions" → 처리방침·지원 주소 확인
2. Apple Developer → Identifiers → `com.dragonforce.game` 등록
3. App Store Connect → 앱 추가(이름·기본 언어 한국어·Bundle ID·SKU 예: dragonforce001) → 앱 정보의 Apple ID(숫자)를 `codemagic.yaml`의 `APP_STORE_APPLE_ID`에
4. Codemagic → Dragon-Force 저장소 추가 → 워크플로 `ios-testflight` 실행 → TestFlight에서 아이폰 설치·플레이
5. 아이콘·스크린샷·설명 넣고 연령 등급 설문 → 심사 제출(버튼은 제작자)

## 토스(앱인토스)는 나중에
코드(`src/platform/toss.ts`, `apps-in-toss.config.ts`, `npm run build:toss`)는 그대로 둔다. iOS 빌드에는 들어가지 않는다. App Store 출시 후 그 자체등급 정보로 앱인토스 등급 증빙 → `docs/RELEASE.md`의 앱인토스 항목.
