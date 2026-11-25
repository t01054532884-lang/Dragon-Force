# 영어 버전 (2026-11-25 밤, 제작자 요청: 해외 이용자도 설치·이용할 수 있게)

## 어떻게 동작하나
- 설정 → **언어 / Language** 버튼(한국어 ↔ English). 누르면 다시 불러와 모든 화면이 바뀐다. 필살기 외침 목소리도 같은 언어.
- 처음 설치하면 **기기 언어를 따른다**(한국어 기기 → 한국어, 그 밖 → English). 토스 앱은 늘 한국어(설정에 언어 버튼 없음).
- 코드의 한국어 문장은 그대로 두고, **글자를 화면에 그리는 순간** 영어 사전으로 바꾼다(`src/i18n/index.ts`가 Phaser `Text.setText`를 감쌈). 한국어 모드에서는 아무것도 하지 않음.
- 사전 `src/i18n/en.ts`: 한국어 원문 → 영어 약 1,700개. 숫자·이름이 들어가는 문장은 `{0}` 자리 틀로. 못 찾으면 줄·구분자(" · ")로 나눠 조각마다 → 마지막엔 아는 낱말·숫자 단위(초 → s 등)만 바꿈.

## 새 문장을 넣었을 때
1. `py scripts/i18n_extract.py <폴더>` → 소스의 한국어 문장을 뽑는다(chunk-*.json).
2. 사전에 없는 것만 번역해 `en-<n>.json`({한국어: 영어})으로 만들고 `py scripts/i18n_build.py <폴더>` → `en.ts`에 합쳐진다(자리 `{0}` 수가 다르면 빠지고 알려 줌, 기존 값 유지).
3. 개발 서버에서 영어로 바꾸고 화면을 돌면, 번역이 덜 된 문장이 `window.__i18nMiss`에 모인다. 숨겨진 미리보기 창에서는 주소에 `?timer=1`.
4. `npm test`의 `tests/i18n.test.ts`가 사전 문장이 영어에서 한국어 없이 나오는지 본다.

## 확인한 것 / 남은 것
- 확인: 로비·드래곤·상점·장비·보상(미션)·이벤트·스킨·선물함·패스·연구소·전투(레벨업 카드·일시정지) 화면을 영어로 돌려 남은 한국어 0. 화면 사진: 로비·상점·드래곤·레벨업 카드.
- 고친 것: 상점 "1 hit" → "x1", 장비 상자 설명 줄임, 연계 띠 줄임, 숫자 단위 "개" 앞 x 제거.
- **남은 것 — 누가 하나로 나눔(2026-11-25)**:

| 남은 것 | 누가 | 상태 |
|---|---|---|
| 처리방침·약관 영어판 | AI | ✅ 초안 `docs/legal/privacy-en.html`·`terms-en.html`. 설정 화면에 "개인정보처리방침·이용약관" 버튼(영어 모드면 -en 페이지). **[ ] 칸 채운 뒤 4개 파일을 `public/`으로 옮겨야 버튼 주소가 열림** |
| 고객 지원 페이지 영어판 | AI | ✅ `public/support-en.html`(한국어판도 서버·Apple 연결 기준으로 고침) |
| App Store 영어 페이지 문구 | AI | ✅ `docs/APPSTORE_EN.md`(이름·부제·설명·키워드·심사 메모·영양 라벨) → 제작자가 App Store Connect에 붙여 넣기 |
| 영어 스크린샷 | AI | 제출 때 영어 모드 실제 화면 캡처(그림 담당 필요 없음) |
| 영어 로고 `logo-en` | **Higgsfield(제작자가 생성)** | 그림 담당에게 받을 필요 없음. 한글 로고 `public/art/logo-ko.webp`를 참고 그림으로 넣고 글자만 바꾸는 편집 → 받은 원본을 AI가 배경 제거·800×254 맞춤·연결 |
| 겨울 축제 배너 영어판 `event-winter-en` | **Higgsfield(제작자가 생성)** | ⚠ 새로 찾음: `event-winter.webp`에 "겨울 축제" 글자가 그림에 박혀 있어 영어 모드에서도 한글로 보임. 축제가 12/1 시작이라 먼저. 같은 방식(글자만 바꾸기) |
| 필살기 외침 영어 목소리 | Higgsfield(시트 'Higgsfield 우선순위' 2·4번) | 레드 먼저(제출 전), 나머지 18종은 업데이트 |
| 번역 검수 | 제작자(+필요하면 원어민) | AI 번역 1차본. 결제·환불 안내(청약철회 등)는 법률 확인 필요 |

Higgsfield 편집 요청문(그림 모델, 참고 그림 1장 넣고):
- 로고: `Keep this game logo exactly the same style — same glossy red-gold 3D lettering, same dragon ornament, same outline and lighting. Replace only the Korean text with the English words "DRAGON FORCE" on one line. Plain solid background, no other text.`
- 축제 배너: `Keep this banner exactly the same — same dragons, gifts, snow, lanterns and composition. Replace only the Korean text with "WINTER FESTIVAL" in the same golden 3D lettering. No other text.`
- 받을 때 확인: 철자, 글자 뒤에 다른 글자 생기지 않았는지, 원래 그림과 같은 비율(로고 약 3.1:1, 배너 약 2.9:1). 워터마크 없는 원본 보관.
- 알려진 한계: 영어가 한국어보다 길어 좁은 칸에서 줄이 넘칠 수 있음(로비 오른쪽 "Settings" 등 가장자리) — 보이는 대로 사전 값을 짧게 고친다.
