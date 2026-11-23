# 소리 요청서 9 — 신규 드래곤 9종 공격·전용 스킬 · 스킨 룰렛 (23개, 2026-11-24)

요청서 7(`docs/ART_REQUEST_7.md`) 소리 표를 자세히 푼 것. 지금은 이 소리들이 없어서 비슷한 기존 소리를 빌려 쓰거나(하울 = 보스 격노 소리를 높여서, 보이드 = 폭발 소리를 낮춰서) 소리가 없다.

## 공통 규칙
- **형식**: mp3(또는 wav), 44.1kHz, 모노 괜찮음. 파일 이름은 표 그대로 → `public/sfx/<이름>.mp3`, AI가 `src/systems/Sfx.ts`에 등록·연결.
- **시작에 무음 없이 바로**, 끝은 자연스럽게 사라짐. 최대 음량 −1dB 아래. **음악·목소리·말소리·노래 없음.**
- **권리**: 상업 이용이 되는 도구·라이선스로만. 도구 이름과 만든 날짜를 알려 주면 `docs/SOUND.md` 출처 표에 적는다(기존 규칙).
- **영어로 요청하면 효과음 AI가 더 정확**하다. 아래 "영어 설명"을 그대로 쓰고, 길이(초)도 같이 넣는다.
- 게임 안 음량: 전투 0.35 · 화면(UI) 0.45 · 보상 0.6 — 기존 소리들과 크기가 비슷하게 맞춰 달라.

## A. 기본 공격 소리 9개 — 가장 자주 울림(1초에 1~3번)
귀가 피곤하지 않게 **짧고(0.1~0.25초) 가볍고 작게**, 울림(잔향) 거의 없이. 같은 소리가 계속 반복돼도 거슬리지 않아야 한다.

| 파일 | 길이 | 언제 | 느낌 | 영어 설명(그대로 붙이기) |
|---|---|---|---|---|
| `sfx-aurora-shot` | 0.2초 | 오로라 빛살 발사 | 유리 풍경이 스치는 맑은 "슈잉" | soft magical shimmer whoosh, glassy chime, bright and airy, very short, no reverb tail |
| `sfx-mirror-ping` | 0.12초 | 미러 광탄이 튕길 때마다 | 유리에 튕기는 아주 짧은 "핑" | tiny crystal ping, glass ricochet, high pitched, very short and soft |
| `sfx-chrono-shot` | 0.12초 | 크로노 시곗바늘 화살 발사 | 빠른 화살 "슉" + 아주 작은 시계 "틱" | quick arrow whoosh with a tiny clock tick at the start, short, light |
| `sfx-void-shot` | 0.25초 | 보이드 중력 구슬 발사 | 낮고 묵직한 "우웅" | low heavy gravity orb launch, deep soft hum thump, short, not loud |
| `sfx-sand-shot` | 0.15초 | 샌드 모래 산탄 발사 | 모래를 확 뿌리는 "샤악" | quick sand spray burst, grainy whoosh, short and soft |
| `sfx-steel-disc` | 0.25초 | 스틸 원반 던질 때 | 톱날 원반이 도는 "위잉" 금속음 | spinning metal saw disc throw, metallic whirr, short, light |
| `sfx-bloom-pop` | 0.2초 | 블룸 씨앗이 터질 때 | 꽃봉오리가 터지는 "퐁" + 나뭇잎 바스락 | soft flower bud pop with a light leaf rustle, cute, short |
| `sfx-howl-pulse` | 0.2초 | 하울 음파 고리마다 | 낮은 "웅" 음파 | soft low sonic pulse, subtle woomp, short, not harsh |
| `sfx-crimson-slash` | 0.15초 | 크림슨 낫 베기 | 날카로운 "쉭" | sharp scythe swish, fast blade swipe, short, clean |

## B. 전용 스킬 소리 10개 — 60초마다(크로노·보이드·오로라는 기본 공격 5·10·20회마다)
한 번 크게 울리는 필살기라 **1~2초로 존재감 있게**. 그래도 배경음악을 덮지 않게.

| 파일 | 길이 | 언제 | 느낌 | 영어 설명 |
|---|---|---|---|---|
| `sfx-aurora-sweep` | 1.2초 | 오로라 극광의 장막 | 오로라가 휩쓰는 넓은 "쏴아아" + 높은 화음 반짝임, 왼쪽→오른쪽 | sweeping aurora wave, wide airy whoosh with shimmering high chimes, magical, moves left to right |
| `sfx-mirror-clone` | 0.8초 | 미러 만화경(분신 등장) | 거울 여러 장이 동시에 울리는 "챙—" | several mirrors resonating at once, crystalline shimmer ring, magical clone appear |
| `sfx-chrono-tick` | 3.0초 | 크로노 시계 폭탄 대기 | 째깍째깍, 점점 빨라짐 → 끝에 "땡" | clock bomb ticking that speeds up over 3 seconds, ending with a small bell ding |
| `sfx-chrono-boom` | 0.8초 | 시계 폭탄 폭발 | 태엽이 풀리며 터지는 금속성 폭발 | clockwork explosion, springs and gears bursting, metallic boom, punchy |
| `sfx-void-hole` | 2.5초 | 보이드 블랙홀 | 빨아들이는 낮은 소용돌이 "우우웅", 커졌다 사라짐 | black hole vortex, deep swirling suction hum that swells then fades, sci-fi magical |
| `sfx-sand-swamp` | 1.5초 | 샌드 모래 늪 | 모래가 꺼지며 흘러내리는 "스르르" | sand sinking and flowing into a quicksand swirl, grainy rumble |
| `sfx-steel-swords` | 1.5초 | 스틸 칼날비 | 칼이 연달아 꽂히는 "챙챙챙" | rain of steel swords stabbing the ground in rapid succession, metallic clangs |
| `sfx-bloom-thorns` | 1.0초 | 블룸 가시 정원 | 덩굴이 솟는 "쑤욱" + 가시 긁는 소리 | thorny vines bursting up from the ground, creaking plant growth with scratchy thorns |
| `sfx-howl-roar` | 1.5초 | 하울 용의 포효 | 드래곤 포효 + 땅울림 | cute but powerful young dragon roar with a ground rumble shockwave |
| `sfx-crimson-drain` | 1.0초 | 크림슨 진홍의 갈증 | 베는 소리 뒤 빨려 드는 낮은 "스으읍" | wide blade slash followed by a dark magical life-drain suction |

## C. 스킨 룰렛 소리 4개 — 화면(UI)
| 파일 | 길이 | 언제 | 느낌 | 영어 설명 |
|---|---|---|---|---|
| `sfx-roulette-tick` | 0.05초 | 빛이 칸을 지날 때마다(돌 때 20번 이상 연속) | 아주 짧은 "틱" — 연속으로 울려도 거슬리지 않게 | tiny soft UI tick, roulette wheel click, extremely short |
| `sfx-roulette-win` | 0.6초 | 일반 칸 당첨 | 밝고 짧은 당첨음 | bright short reward chime, positive, cheerful |
| `sfx-roulette-jackpot` | 1.5초 | 스킨·망토 당첨 | 화려한 팡파르 | magical jackpot fanfare, sparkling rising chimes, celebratory, short |
| `sfx-key-use` | 0.3초 | 뽑기 버튼(열쇠 사용) | 자물쇠가 열리는 "딸깍" + 작은 반짝임 | key turning in a lock, satisfying click with a small magical sparkle |

## 받는 방법
- 파일로 주면(폴더째 또는 압축) AI가 `public/sfx/`에 넣고 연결한다. 일부만 와도 된다(없는 것은 지금처럼 대신하는 소리).
- 어떤 도구로 만들었는지 한 줄 알려 주기(출처 표).
