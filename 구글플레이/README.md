# 구글 플레이 출시 — 정리 · 기록

제작자 결정(2026-11-26): **사업자(조직) 개발자 계정**으로, **결제 넣고 출시**, 빌드는 **Codemagic**.
App Store 제출(다른 세션, `main`)과 섞이지 않게 **`google-play` 브랜치 + 이 폴더**에서 따로 한다. App Store 제출이 끝나면 `main`에 합친다.

- 브랜치: `google-play` (작업 폴더: 제작자 PC `C:\Users\t0105\dragon-force-android` — OneDrive 밖)
- 패키지 이름(applicationId): `com.dragonforce.app` (iOS 번들 ID와 같게, 한 번 올리면 못 바꿈)
- 빌드: `npm run build:android` → `cap sync android` → Codemagic이 서명된 `.aab`를 만들어 Play Console 내부 테스트 트랙에 올림

## 1. 계정(제작자) — 가장 오래 걸리니 먼저
1. **D-U-N-S 번호** 발급 — **Apple 개발자 D-U-N-S 조회 도구로 무료 신청**(2026-11-26 확인)
   - 한국 직접 창구(NICE D&B 온라인 기업인증)는 **유료**: 신규 500,000원 + VAT(7영업일). D&B 본사 "Google Developer" 경로도 한국은 NICE로 연결됨.
   - 무료 경로: developer.apple.com/enroll/duns-lookup (Apple 계정 로그인) → 지역 South Korea → 법인명·주소·전화·연락처(모두 로마자) → 조회 → 없으면 D&B에 무료 제출 → 메일로 번호(보통 영업일 5일~2주). 같은 번호를 Google Play에도 쓴다.
   - 법인명은 **영문 사업자등록증명에 적힌 영문 상호 그대로**. 주소는 제작자 결정(2026-11-26): 동·호수 같은 상세주소는 빼고 도로명 + 우편번호.
   - **주의**: Google은 결제 프로필의 이름·주소가 D&B 기록과 **글자까지 같아야** 인증함 → D-U-N-S 신청에 쓴 주소를 메모해 두고 Google 결제 프로필에도 똑같이.
   - 조직 계정은 Google Play에 법적 이름·주소·D-U-N-S·개발자 메일·전화가 **공개**됨(Google 도움말 13628312).
2. **Google Play Console 조직 계정** 만들기: play.google.com/console → 조직 → D-U-N-S 입력 → 등록비 **$25(1회)** 결제 → 신원·조직 확인(며칠).
   - 조직 계정은 "테스터 12명 × 14일 비공개 테스트" 조건이 없다(개인 계정만 있음).
3. **판매자(결제) 프로필** 연결: Play Console → 설정 → 결제 프로필(사업자 정보·정산 계좌) — 유료 상품을 팔려면 필요.

## 2. 코드(이 브랜치)
- [x] 플랫폼 `android` 추가(`src/platform/android.ts`): 저장·안전 영역·백그라운드는 iOS와 같음, **안드로이드 뒤로가기** 처리(전투 → 일시정지, 다른 화면 → 로비, 로비 → 종료 확인)
- [x] 결제: iOS와 같은 RevenueCat SDK·서버 함수, 키만 `VITE_REVENUECAT_ANDROID_KEY` (`src/systems/Cloud.ts`)
- [x] 결제 안내 문구 "Google Play 정책"(안드로이드)
- [x] "Apple로 연결" 버튼은 iOS에서만 — 안드로이드는 기기 저장 + 게스트 클라우드(Google 로그인은 다음 업데이트 후보)
- [x] Capacitor 안드로이드 프로젝트(`android/`, targetSdk 36) · 세로 고정 · 전체 화면 · 앱 아이콘(적응형 포함) · 시작 화면(어두운 바탕 + 로고) · versionName 1.0.0
- [x] Codemagic 안드로이드 워크플로 `android-play`(`codemagic.yaml`): 테스트 → 게임 빌드 → versionCode = 빌드 번호+100 → 서명된 AAB. Play 자동 업로드는 서비스 계정을 넣은 뒤 주석 해제
- [ ] **업로드 키(.jks)** 만들기 → Codemagic "Android keystores"에 참조 이름 `dragonforce_upload`로 등록(키 파일·비밀번호는 잃어버리지 않게 따로 보관, 저장소·채팅에 올리지 않음). Play App Signing을 쓰면 업로드 키를 잃어버려도 재설정 가능
- [ ] 실제 안드로이드 기기에서 확인: 위쪽 카메라 구멍·아래 내비게이션 바와 겹침, 뒤로가기, 소리, 백그라운드 정지

## 3. 결제(계정·판매자 프로필 뒤, 제작자 + AI)
- [ ] Play Console에 인앱 상품 17종(소모품) — 상품 ID는 iOS와 같게(`src/data/iap.ts`)
- [ ] RevenueCat에 Android 앱 추가 → Google Play 서비스 계정 JSON 연결 → **공개 키**를 Codemagic 환경 변수 `VITE_REVENUECAT_ANDROID_KEY`에(비밀 키는 채팅·저장소에 붙이지 않기)
- [ ] 내부 테스트 트랙에서 테스트 결제(라이선스 테스터 계정)

## 4. 스토어 등록 정보(`자료/`)
- [x] 앱 아이콘 512×512 PNG `자료/icon-512.png`
- [x] 그래픽 이미지(Feature graphic) 1024×500 `자료/feature-1024x500.png`
- [x] 휴대전화 스크린샷 6장(9:16, 720×1280) `자료/phone-*.png`
- [x] 짧은 설명(80자) · 자세한 설명 · 출시 노트 · 콘텐츠 등급 답 초안 → `스토어문구.md` (영어는 `docs/APPSTORE_EN.md`에서 옮기면 됨)
- [ ] 개인정보처리방침 URL(이미 공개: GitHub Pages `privacy.html`)
- [ ] 앱 콘텐츠: 데이터 보안 양식 · 콘텐츠 등급(IARC 설문) · 광고 없음 · 대상 연령 · 앱 액세스(로그인 없이 전부 이용 가능)

## 데이터 보안 양식 답(초안 — 처리방침과 맞춤, 제출 전 다시 확인)
- 수집: **앱 활동·식별자** — Firebase 익명 사용자 ID(클라우드 저장), 게임 진행 데이터. **구매 내역** — 결제 확인(RevenueCat·서버)
- 공유: 없음(서비스 제공 목적의 처리 위탁: Google Firebase, RevenueCat)
- 전송 중 암호화: 예 · 삭제 요청: 예(게임 설정 → 계정 삭제)
- 광고 ID: 사용 안 함

## 진행 기록
| 날짜 | 한 일 | 비고 |
|---|---|---|
| 2026-11-26 | `google-play` 브랜치·작업 폴더, 안드로이드 플랫폼 코드(뒤로가기·결제 키·Apple 연결 숨김), 이 문서 | 계정은 사업자(조직) → D-U-N-S부터 |
