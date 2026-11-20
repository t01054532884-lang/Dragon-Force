# 출시 준비 — App Store · 앱인토스

제작자 결정(2026-11-18): **App Store 먼저 → 그 자체등급 정보로 앱인토스**. 같은 날 추가 결정: **토스는 나중에, 지금은 App Store 출시에 맞춘다** → 진행·체크리스트는 `docs/APPSTORE.md`. 식별자 토스 `dragon-force` / iOS `com.dragonforce.game`.
수익화: App Store로 먼저 내고, 수익이 나기 시작하면 사업자등록. 토스 인앱결제는 사업자등록이 먼저라 토스는 결제 없이 시작.

## 한 코드, 세 가지 빌드
| 명령 | 대상 | 결과 |
|---|---|---|
| `npm run build` | 웹(GitHub Pages·개발) | `dist/` |
| `npm run build:ios` | iOS 앱 | `dist/` → `npx cap sync ios`로 `ios/App/App/public`에 복사. 실제 앱 빌드는 Codemagic(`codemagic.yaml`) |
| `npm run build:toss` | 앱인토스 | `dist/` → `dragon-force.ait` (콘솔에 올리거나 `npx ait deploy`) |

빌드 모드가 `VITE_PLATFORM`(`.env.ios`, `.env.toss`)을 정하고, `src/platform/index.ts`가 그 플랫폼 구현 하나만 불러온다(다른 플랫폼 SDK는 번들에 안 들어감).

| 기능 | 웹 | iOS(Capacitor) | 앱인토스 |
|---|---|---|---|
| 저장 | localStorage | Preferences(UserDefaults). OS가 WebView 저장소를 지울 수 있어서. 처음 한 번 localStorage 값을 옮김 | SDK `Storage` |
| 안전 영역 | CSS `env(safe-area-inset-*)` | 같음 | SDK `SafeArea` + 오른쪽 위 더보기·X 버튼 줄(48px)만큼 게임 화면을 아래로 |
| 뒤로가기 | 없음 | 없음 | `graniteEvent backEvent`: 전투 → 일시정지/재개, 다른 화면 → 로비, 로비 → 종료 확인 창 |
| 백그라운드 | 전투 자동 일시정지 | 같음(`appStateChange`) | 같음 |
| 화면 방향 | — | Info.plist 세로만, 전체 화면, 상태 표시줄 숨김, 아이폰 전용 | `Screen.setOrientation('portrait')` |

## 조사에서 확인한 규칙 (2026-11-18, 공식 문서)
**App Store**
- 게임 파일을 앱 안에 넣는다(웹사이트를 띄우는 방식은 4.2 "최소 기능" 위험).
- 데이터를 수집하지 않아도 개인정보처리방침 링크가 앱 안과 App Store Connect 양쪽에 필요 → `public/privacy.html`(GitHub Pages).
- 실제 돈 결제가 없으면 인앱결제는 필요 없다. 나중에 루비를 팔면 애플 인앱결제만 써야 하고, 무작위 상자는 구매 전 확률 공개(3.1.1).
- 애플은 게임물관리위원회 자체등급분류사업자 → 앱스토어 출시본에는 별도 등급분류가 필요 없다(2018 지정 보도 기준, 현재 상태는 게임위 원문 미확인).
- 연령 등급 설문(2025 개편)에 정직하게 답한다. 소환(무작위 보상)이 있으니 해당 문항 확인.

**앱인토스**
- 게임 출시 가능. 콘솔에서 앱 유형 "게임". 검토 영업일 3~7일, 검토 전에 토스앱 QR 테스트 1회 이상.
- **게임 등급 증빙 필수**: (a) 다른 스토어에 출시된 게임의 자체등급분류 정보 + 스토어 링크, 또는 (b) 게임물관리위원회 직접 심의(약 10~15일, 수수료). → App Store 출시 후 (a)로.
- 사업자등록: 기본은 불필요. 인앱결제·토스 로그인은 필수. 광고는 누적 수익 5,000원 넘으면 필요.
- 디지털 상품은 토스 인앱결제만, 광고는 토스 광고만. 외부 결제·링크·다른 앱 설치 유도 금지.
- 검수에서 자주 걸리는 것: X 버튼·안전 영역 침범, 종료 확인 창 없음, 안드로이드 뒤로가기, 소리 켜기/끄기와 백그라운드 소리 정지, 재접속 시 기록 사라짐, 첫 화면 10초 넘음.
- 콘솔 자료: 로고 600×600 PNG(배경색 필수), 게임 썸네일 1932×828, 스크린샷 세로 636×1048 3장 이상, 영문 이름 15자 이내(Dragon Force), 고객문의 이메일, 등급 증빙.

## 체크리스트
### 코드 (이 저장소)
- [x] 플랫폼 공통 구조(저장·안전 영역·뒤로가기·백그라운드 일시정지) — `src/platform/`
- [x] 앱인토스 종료 확인 창(로비에서 뒤로가기)
- [x] iOS 프로젝트(`ios/`, Capacitor 8, SPM) · 세로 고정 · 한국어(`CFBundleDevelopmentRegion=ko`) · 암호화 수출 질문 생략(`ITSAppUsesNonExemptEncryption=false`)
- [x] `codemagic.yaml` · `apps-in-toss.config.ts` · `npm run build:toss` → `.ait` 생성 확인
- [x] 개인정보처리방침 페이지 + GitHub Pages 배포 워크플로
- [ ] 앱 아이콘 1024×1024(iOS) · 로고 600×600 · 썸네일 1932×828 · 스크린샷 — 6/9단계 아트와 함께
- [ ] 사운드를 넣을 때: 소리 켜기/끄기 설정, 백그라운드·광고 중 정지(앱인토스 필수)
- [ ] 루비 결제를 넣을 때: 애플 인앱결제(RevenueCat 등 결제 검증 서비스) · 확률 고지 · 처리방침 수정

### 제작자가 할 일 (계정·콘솔)
- [x] GitHub 저장소 Settings → Pages → Source "GitHub Actions" (11/18 완료, 웹·처리방침 주소 열림 확인)
- [ ] Apple Developer: Bundle ID `com.dragonforce.game` 등록
- [ ] App Store Connect: 새 앱 만들기 → Apple ID를 `codemagic.yaml`의 `APP_STORE_APPLE_ID`에
- [ ] Codemagic: Dragon-Force 저장소 앱 추가(API 키·인증서는 예전 앱과 같은 것)
- [ ] App Store Connect: 개인정보 "데이터를 수집하지 않음", 연령 등급 설문, 처리방침 URL, 설명·스크린샷 → 심사 제출(버튼은 제작자)
- [ ] 출시 후 앱인토스 콘솔: 워크스페이스 → 앱 등록(appName `dragon-force`, 유형 게임) → 등급 증빙(App Store 링크·등급) → `.ait` 업로드 → QR 테스트 → 검토 요청
- [ ] 수익이 생기면: 사업자등록(세무서·세무사와 시점 확인) → 토스 정산 정보 → 토스 인앱결제
