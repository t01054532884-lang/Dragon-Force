# 효과음 목록 · 출처 기록

규칙(8단계 v2.0 10.1, HANDOFF 4절): 상업 이용 가능한 것만, 파일마다 출처를 적는다. 파일은 `public/sfx/<키>.mp3`, 코드 목록은 `src/systems/Sfx.ts`의 `SFX_FILES`(목록에 있는 것만 읽음). 목록에 없거나 파일이 없으면 짧은 합성음으로 대신한다.

| 파일 | 용도 | 출처 | 받은 날 |
|---|---|---|---|
| `sfx-chest-shake.mp3` | 상자 흔들림 | 제작자 직접 생성 | 2026-11-20 |
| `sfx-chest-open.mp3` | 뚜껑 열림 | 제작자 직접 생성 | 2026-11-20 |
| `sfx-chest-burst-common.mp3` | 일반 등급 개봉 빛 | 제작자 직접 생성 | 2026-11-20 |
| `sfx-chest-burst-rare.mp3` | 희귀 등급 개봉 빛 | 제작자 직접 생성 | 2026-11-20 |
| `sfx-chest-burst-epic.mp3` | 영웅 등급 개봉 빛 | 제작자 직접 생성 | 2026-11-20 |
| `sfx-chest-burst-legendary.mp3` | 전설 등급 개봉 빛 | 제작자 직접 생성 | 2026-11-20 |
| `sfx-card-flip.mp3` | 보상 카드 뒤집기 | 제작자 직접 생성 | 2026-11-20 |
| `sfx-card-rare.mp3` | 희귀 이상 카드 | 제작자 직접 생성 | 2026-11-20 |

형식: 모노 44.1kHz 128kbps mp3(8개 모두 확인).

## 아직 합성음인 것(파일이 오면 같은 이름으로 넣고 `SFX_FILES`에 추가)
`sfx-red-fire`(화염탄 발사, 묶음당 1번) · `sfx-hit`(적중) · `sfx-player-hit`(드래곤 피격) · `sfx-enemy-die`(적 처치) · `sfx-levelup`(레벨업) — 선택: `sfx-crit`(치명타) · `sfx-explode`(폭발) · `sfx-boss-die`(보스 처치) · `sfx-gem`(경험치 획득) · `sfx-ui-tap`(버튼)
