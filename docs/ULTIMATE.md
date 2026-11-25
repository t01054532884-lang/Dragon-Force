# 180초 필살기 19종 + 3초 애니메이션 컷신 (기획 초안, 2026-11-25)

제작자 결정(2026-11-25): 드래곤마다 60초 전용 스킬을 **180초 필살기**로 바꾸고, 쓰면 **3초 애니메이션**(Higgsfield 영상)이 나온다. 이걸 넣고 App Store에 제출한다.
예시 사진(Higgsfield 홍보 화면)은 분위기 참고만 — 화면 구성·UI는 우리 게임 것.
근거 기획: Higgsfield 애니메이션 기획서 12절 "180초 전역 필살기"(60초 스킬 대신 180초마다 1회, 피해는 60초 스킬 1회 피해 D의 3~5배).

시트: 구글 시트 "드래곤 특공대 출시 일정" → 탭 **180초 필살기**(같은 내용, 결정되면 둘 다 고침).

## 1. 3초 흐름 (모든 드래곤 공통)

| 시간 | 화면 | 누가 만드나 |
|---|---|---|
| 0~0.5초 | 버튼을 누르면 게임이 멈추고(적·시간 정지), 드래곤이 위로 날아올라 전장 밖으로 | 코드 |
| 0.5~2.5초 | **공통 하늘 배경** 위에서 드래곤이 전장을 향해 필살기를 쏘는 장면(화면 전체) | **Higgsfield 영상**(드래곤별 1개) |
| 2.5~3초 | 하얀 섬광 → 전장으로 돌아옴, 그 순간 전장 전체에 피해 + 코드 효과(불길·얼음 등) | 코드 |

- 피해 판정·쿨타임·효과는 전부 코드(영상은 보여 주기만). 영상이 없거나 못 읽으면 코드 연출만으로 같은 효과가 나온다 → 영상이 다 오기 전에도 19종 모두 동작.
- 영상을 짧게(2초 안팎) 쓰면 들어가고 나오는 부분은 코드가 맡아 맵이 달라도 자연스럽다.

## 2. 배경 — 추천: 19종 모두 같은 배경 1장

맵(20단계)마다 다르게 하면 영상이 19 × 20개가 되므로 **공통 배경 1장**으로 한다. 드래곤이 "전장 밖 하늘로 올라가서" 쏘는 장면이라 어느 맵에서 써도 어색하지 않다.

- 추천 장면: **해 질 녘 구름 위 높은 하늘**(아래로 구름 사이 흐릿한 대지). 어둡지도 밝지도 않은 보라·남색 하늘이라 불·얼음·빛·어둠 어느 색 효과도 잘 보인다.
- 만드는 법: 이미지 AI로 배경만 1장(세로 9:16, 글자·캐릭터 없음) → 드래곤별 첫 장면 그림 = 이 배경 + 그 드래곤(같은 자리·같은 크기) → Higgsfield에 첫 장면으로 넣어 3초 영상.

## 3. 영상 규격

- 세로 9:16, 720×1280 이상(1080×1920 권장), 3초, **워터마크·글자 없음**.
- **소리(11/25 변경)**: 영상과 같이 만든 소리(날갯짓·포효·불·폭발)를 그대로 효과음으로 쓴다 — 언어와 상관없어 1벌. 언어별로 다른 건 외침 목소리뿐(7절). 처음엔 "소리 없음"이었지만 같이 만들면 불길과 소리 타이밍이 저절로 맞아서 바꿈(제작자).
- **영상에 글자(스킬 이름)를 넣지 않는다** — 이름은 게임 글자로 띄움. 글자를 넣으면 한국어·영어로 19 × 2 = 38개가 되지만, 빼면 19개로 끝(언어는 효과음 외침만 2벌).
- 카메라는 거의 고정, 드래곤 모습(색·뿔·날개)이 첫 장면과 같아야 함.
- 게임용 변환(AI): mp4(H.264) 720×1280, 한 개 약 1~1.5MB → 19개 약 25MB. 전투에 들어갈 때 **출격한 드래곤 것 1개만** 읽는다.

## 4. 19종 필살기 (AI 1차안 — 이름·연출은 바꿔도 됨)

피해(**확정 11/25**): 화면 안 **일반 몬스터는 모두 처치**. 엘리트·보스는 60초 스킬 1회 피해 D × **등급 배율 — 일반·희귀 4배, 영웅 5배, 전설 6배**(레드는 일반) — 체력이 많으면 살아남는다. 보스는 한 번에 최대 HP의 8%까지(지금 전용 스킬과 같은 상한, 임시).
쿨타임(**확정 11/25**): 일반~영웅 **180초**, 전설 4종(크로노·보이드·오로라·아케인) **120초**. 전설 3종의 "기본 공격 N회마다 자동" 스킬은 없애고 필살기로 바꾼다.

| 드래곤 | 등급 | 지금 스킬(60초) | 필살기(안) | 3초 영상 내용 | 게임 효과(코드) |
|---|---|---|---|---|---|
| 레드 | 기본 | 화염 폭풍 | 불의 파도 | 하늘에서 내려다보며 위→아래로 전장 전체를 덮는 불의 파도 | 전체 피해 + 화상 |
| 블루 | 일반 | 얼음 감옥 | 빙하 강림 | 거대한 얼음 결정이 쏟아져 전장이 얼어붙음 | 전체 피해 + 일반 적 빙결 3초 |
| 옐로 | 일반 | 천둥 폭발 | 천둥 그물 | 구름 사이로 번개 수십 줄기가 그물처럼 내리꽂힘 | 전체 피해 + 감전 |
| 그린 | 일반 | 독의 영역 | 독의 폭우 | 초록 독구름이 퍼지며 독비가 쏟아짐 | 전체 피해 + 중독 |
| 샌드 | 일반 | 모래 늪 | 모래 폭풍 | 거대한 모래 회오리가 전장을 휩쓺 | 전체 피해 + 둔화·약화 |
| 스틸 | 일반 | 칼날비 | 천 개의 검 | 하늘을 메운 강철 검이 일제히 낙하 | 전체 피해(엘리트·보스 추가) |
| 화이트 | 희귀 | 신성한 가호 | 성광의 기둥 | 빛기둥이 내려와 전장을 정화 | 전체 피해 + HP 회복 |
| 블랙 | 희귀 | 암흑 폭발 | 검은 일식 | 해를 가린 검은 구체가 터지며 어둠이 쏟아짐 | 전체 피해 |
| 스톤 | 희귀 | 대지의 수호 | 운석 낙하 | 거대한 바위 운석이 떨어져 땅이 갈라짐 | 전체 피해 + 피해 감소 |
| 블룸 | 희귀 | 가시 정원 | 만개 | 거대한 꽃이 피며 가시 덩굴이 전장을 덮음 | 전체 피해 + 속박 |
| 하울 | 희귀 | 용의 포효 | 천지의 포효 | 하늘에서 포효, 음파 고리가 전장을 덮침 | 전체 피해 + 일반 적 기절 |
| 윈드 | 영웅 | 폭풍의 질주 | 대폭풍 | 거대 토네이도가 전장을 가로지름 | 전체 피해 + 이동속도 증가 |
| 워터 | 영웅 | 해일 | 대해일 | 하늘에서 거대한 파도가 전장을 덮침 | 전체 피해 + 밀쳐냄·둔화 |
| 크림슨 | 영웅 | 진홍의 갈증 | 핏빛 초승달 | 하늘을 가르는 거대한 초승달 베기 | 전체 피해 + 흡수 회복 |
| 미러 | 영웅 | 만화경 | 거울 세계 | 수십 개 거울 분신이 일제 사격 | 전체 피해 |
| 크로노 | 전설 | 시계 폭탄(자동) | 시간 정지 | 거대한 시계 문자판, 바늘이 멈추고 폭발 | 전체 피해 + 적 정지 3초 |
| 보이드 | 전설 | 중력 붕괴(자동) | 사건의 지평선 | 하늘에 초대형 블랙홀이 열려 빨아들임 | 전체 피해 + 일반 적 끌어당김 |
| 오로라 | 전설 | 극광의 장막(자동) | 극광 강림 | 극광 커튼이 내려와 전장을 휩쓺 | 전체 피해 |
| 아케인 | 전설 | 마력 폭주 | 마력 유성우 | 거대 마법진에서 마력 유성이 쏟아짐 | 전체 피해 |

## 5. 결정 (2026-11-25)

1. **공통 배경** — 확정: 해 질 녘 구름 위 높은 하늘 1장, 19종 공통
2. **전설** — 확정: 자동 스킬을 필살기로 교체, 전설 4종은 2분(120초)마다
3. **피해** — 확정: 일반 몬스터 모두 처치, 엘리트·보스는 일반·희귀 4배 · 영웅 5배 · 전설 6배
4. **출시 범위** — 확정: **레드 영상 1개만 넣고 제출** → 그 사이 제작자가 19개 모두 제작 → 받는 대로 넣고 새 빌드
5. **연출 중** — 확정: 3초 동안 게임 멈춤(어려우면 3초 무적 보호막)

### 출시 범위 설명
- 필살기 기능(쿨타임·버튼·게임 멈춤·전장 전체 피해·효과)은 **19종 모두 처음부터 동작**한다.
- 다른 건 가운데 2초 장면뿐: 영상이 있는 드래곤은 Higgsfield 영상, 아직 없는 드래곤은 같은 공통 배경 그림 위에 그 드래곤 그림 + 코드 효과(불꽃·얼음 등)로 대신 보여 준다.
- 그래서 19개 영상이 다 나올 때까지 제출을 기다리지 않아도 된다. 영상은 앱 안에 들어가므로 새 영상이 생길 때마다 새 빌드로 올린다.

## 6. 영상 만드는 순서(확정 11/25)

① 제작자: 첫 장면 그림(공통 배경 + 드래곤)과 움직임 설명을 보냄 → ② AI: Higgsfield 영상 요청 문장(프롬프트) 작성 → ③ 제작자: Higgsfield에서 생성(나중에 MCP 연결) → ④ AI: 게임용 변환·연결·새 빌드

## 7. 효과음(한국어·영어) — 2026-11-25 정리, 시트 "180초 필살기" H~K열

- (11/25 변경) 효과음은 **영상에 들어 있는 소리**를 쓴다(게임이 같은 mp4를 소리로 한 번 더 읽어 영상과 같은 구간부터 틂). 따로 만들 것은 **외침 목소리(한국어/English)** 2개뿐. 아래 줄은 변경 전 기록.
- (이전) 영상은 소리 없이, 소리는 따로 2개: **효과음 + 외침(한국어)** / **효과음 + 외침(English)**. 효과음은 같고 외침 목소리만 다름.
- 3초(영상과 같은 길이): 0~0.5초 날아오름 → 0.5~2.5초 필살기 → 2.5초쯤 섬광·폭발. 외침은 0.6~1.4초 사이 한 번.
- 파일 `ult-<드래곤>-ko` / `ult-<드래곤>-en`(m4a 또는 mp3), 배경음악보다 조금 크게.
- 게임: 설정에 "음성 언어: 한국어 / English" → English면 en 파일. 게임 글자는 아직 한국어만(외침만 바뀜).
- 드래곤별 외침·효과음 내용은 시트. 요청 문장은 AI가 드래곤마다 써 줌(레드 먼저).

## 8. Higgsfield 쓰는 법(추천, 11/25 — 시트 "Higgsfield 우선순위" 아래쪽)

- Ultra: 월 3,000 크레딧. 표시 기준 영상 1개(Seedance 2.5) 약 15 크레딧.
- 필요: 영상 51개(필살기 19 · 보스 2페이즈 컷인 20 · 홍보 컷 5 · 상자 2 · 로비·해금 2 · 화면 효과 3) × 2~3번 생성 ≈ 100~150번 ≈ 1,500~2,300 크레딧 → 한 달 안. 다른 영상 모델은 값이 다를 수 있음.
- **7일 무제한은 그림 모델**(Nano Banana Pro·Seedream·GPT Image 등)이고 **higgsfield.ai 웹에서만**("무제한 및 무료 생성은 higgsfield.ai에서만") → MCP는 크레딧 차감으로 보임(연결 후 확인).
- 순서: ① 가입 직후 7일 동안 웹에서 그림을 몰아서 — 공통 하늘 배경 1 · 필살기 첫 장면 19 · 보스 그림 39(기본 19 + 2페이즈 20) ② 그 그림을 첫 장면으로 영상은 크레딧으로(웹 또는 MCP).
- 효과음(필살기 38 · 보스 20)을 Higgsfield에서 만들 수 있는지는 확인 필요.

## 9. 전체 순서

1. (제작자) 공통 배경 1장 → 레드 첫 장면 그림 → Higgsfield 3초 영상 1개
2. (AI) 180초 필살기 시스템 + 코드 연출(19종) + 영상 재생(없으면 코드만) — 레드 영상으로 확인
3. (제작자) 나머지 18종 영상 → (AI) 변환·연결
4. 봇으로 피해 배율 측정 → 스크린샷 → App Store 제출

## 10. 레드 영상 제작 기록 (2026-11-25, Higgsfield MCP — 나머지 18종도 같은 방식)

**흐름**: 제작자 컷 8장(`드래곤 포스/output/red-dragon-skill-v7-8cuts.zip`) → AI가 Higgsfield MCP로 ① 공통 배경 ② 처음 장면 ③ 끝 장면(그림 GPT Image 2.6, 장당 2크레딧) → ④ 처음·끝 장면을 넣어 영상. 원본은 `art-src/ult/`(git 제외), 게임용은 `scripts/process_art_ult.py` → `public/art/ult/`.

**모델 비교(같은 처음·끝 장면, 소리 포함)** — 제작자 선택: **Seedance 2.5**
| | Kling 3.0 Pro 3초 | Seedance 2.5 720p 4초 (채택) |
|---|---|---|
| 흐름 | 1.3초에 불, 1.7초부터 파도 | 정면 포즈 뒤 2.1초 불, 3초쯤 파도 |
| 장단점 | 빠름, 0.5초쯤 날개 흐림, 1080p 9MB | 드래곤이 또렷·귀여움, 720p 2.7MB |
| 크레딧 | 약 7.5 | 28 (Seedance 무료 초 선물은 MCP에선 적용 안 됨) |

**게임 연출(코드 `src/ui/UltCutscene.ts`)**: 날아오름 0.45초 → 영상 0.6~3.9초 구간(처음 0.6초는 드래곤이 반쯤 잘려 건너뜀, 같은 배경을 먼저 깔고 영상은 0.6초에 도달하면 보임) → 섬광 0.5초 → 전장 피해. **전체 약 4.25초**(영상 없는 드래곤은 3초 그대로). **화면을 누르면 넘김**(0.3초 뒤부터, 바로 섬광 → 피해는 똑같이, 영상 소리 끊김). 영상 소리는 같은 mp4를 Web Audio로 한 번 더 읽어 같은 구간부터 튼다(아이폰에서 영상 소리 자동재생이 막혀도 소리가 남).
**전장 효과(섬광 뒤, 11/25 제작자 요청)**: 필살기 피해가 화면 전체라 효과도 화면 전체 — Higgsfield로 만든 투명 배경 "불의 파도" 그림(`ult-fx-red.webp`, GPT Image 2.6 2장 중 2번, 끝 장면을 참고로 같은 불 색)이 화면 위에서 아래로 0.75초에 쓸고 지나가고, 지나간 자리에 붉은 빛이 남았다 사라지며 불씨가 흩날린다(`playUltSweep`). 기존 레드 화염 폭발·바닥 불길(드래곤 주변)은 그대로 같이 나온다. 그림이 없는 드래곤은 같은 흐름을 그 드래곤 색 띠로.
- 요청문: `Game VFX sprite, isolated on a fully transparent background: one giant horizontal wall of a curling tsunami wave made entirely of fire, seen from slightly above, running edge to edge across the whole width of the image, the crest curling forward and downward like a breaking ocean wave. Same fire style and colors as the fire wave in the reference image: <orange, gold and white-hot flame>, bright glowing core along the crest, licking flame tongues, sparks and embers flying off the top, a softer translucent orange trail fading out along the upper edge. Stylized 3D animated feature-film look matching a cute fantasy mobile game. No dragon, no sky, no clouds, no ground, no background, no text, no watermark.`(2048×1024, 투명 배경, 참고 그림 = 그 드래곤 끝 장면) → 가공 때 위아래 뒤집어 물마루가 아래(가는 쪽)를 향하게.
드래곤을 추가할 때: 영상을 `art-src/ult/`에 받고 `process_art_ult.py`의 `VIDEOS`에 한 줄 → `UltCutscene.ts` `ULT_VIDEO`에 `{ from, to }`(드래곤이 화면에 다 들어온 시점 ~ 필살기가 화면을 덮은 시점). 전장 효과 그림은 `process_art_ult.py` `FX`에 한 줄 → `ULT_FX_READY`에 드래곤 추가.

**요청문(영어, 그대로 재사용 — `<…>`만 드래곤별로)**
- 공통 배경(1번만): `Vertical 9:16 background plate for a mobile game ultimate-skill cutscene, stylized 3D animated feature-film look (soft, polished, cute fantasy style like a high-end animated movie), no characters. High in the sky above a vast sea of clouds at sunset: a warm golden-orange sun glow sits low near the horizon at about 60% of the image height; the sky gradient runs from deep violet and indigo at the top through magenta to warm amber near the horizon. Layered fluffy cumulus clouds, tops lit pink-gold, shadows soft lavender. Through gaps in the clouds far below, a faint misty fantasy land with forests and a winding river is visible. The upper half is open sky with room for a flying character; the lower third is the cloud sea and land as the target area. Majestic, cinematic depth, atmospheric haze, a few drifting golden light particles. No characters, no creatures, no text, no logo, no UI, no watermark.`
- 처음 장면(참고 그림: 배경 + 드래곤 비행 컷): `Use image 1 as the exact background: same sunset sky, clouds, sun, land, colors and composition, unchanged. Place the <red baby dragon> from image 2 into the upper-left third of the frame, flying diagonally toward the lower right, wings spread wide, fierce determined expression, mouth closed with a few <embers> at the mouth<, tail flame burning>. Keep the dragon's design exactly as in image 2: <crimson scales, cream belly, golden curved horns and spikes, orange bat wings, flame-tipped tail>, same stylized 3D animated look. Warm sunset rim light on the dragon. The dragon spans about 40% of the frame width. No text, no logo, no watermark.`
- 끝 장면(참고 그림: 배경 + 드래곤 공격 컷): `Same sunset sky and sea of clouds as image 1. Climax of the '<Wave of Fire>' ultimate attack: <a colossal tsunami of fire crashes down over the sea of clouds and land, a towering curling wave of orange, gold and white-hot flame covering the lower two thirds of the frame from edge to edge, glowing embers, sparks and heat haze everywhere, clouds lit fiery orange>. At the top center, the <red baby dragon> from image 2 (same design: <…>, same stylized 3D animated look), smaller, wings spread, <breathing a thick roaring stream of fire straight down that feeds the wave>. Epic, majestic, very bright glowing core. No text, no logo, no watermark.`
- 영상(Seedance 2.5, mode omni_reference, 4초, 720p, 9:16, 소리 켬, start_image·end_image): `Epic 4-second ultimate-skill cutscene for a fantasy mobile game, stylized 3D animated film look, vertical. Over a sunset sea of clouds, the cute <red baby dragon> swoops in from the upper left, flaps up to the top center, rears back with wings flared and roars, then <unleashes a massive torrent of fire straight down. The flame stream explodes into a gigantic rolling Wave of Fire that crashes down and sweeps across the entire cloud sea and land from top to bottom: curling crest of orange-gold flame, white-hot core, swirling embers, heat distortion, a shockwave rippling through the clouds>. Camera nearly locked with a slight push-in and a short shake on impact. Dragon design stays identical to the first frame. Fast, powerful, majestic, cinematic lighting. Sound: wing whoosh, a fierce cute dragon roar, <deep roaring fire blast, crackling flames> and a heavy boom on impact; no music, no speech. No text, no logo, no watermark.`
- 한 드래곤 비용(첫 시도): 그림 2장 4 + 영상 28 = 약 32크레딧 → 18종 약 580크레딧(다시 만들기 포함 여유 두 배).
