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

## 전투 10종 (2026-11-20)
| 파일 | 길이 | 용도 | 출처 |
|---|---|---|---|
| `sfx-red-fire.mp3` | 0.72초 | 레드 화염탄 발사(묶음당 1번) | 제작자 직접 생성(원본 합성음) |
| `sfx-hit.mp3` | 0.25초 | 적중(최소 간격 60ms) | 제작자 직접 생성(원본 합성음) |
| `sfx-player-hit.mp3` | 0.38초 | 드래곤 피격 | 제작자 직접 생성(원본 합성음) |
| `sfx-enemy-die.mp3` | 0.65초 | 적 처치 | 제작자 직접 생성(원본 합성음) |
| `sfx-levelup.mp3` | 1.25초 | 레벨업 | 제작자 직접 생성(원본 합성음) |
| `sfx-crit.mp3` | 0.47초 | 치명타 | 제작자 직접 생성(원본 합성음) |
| `sfx-explode.mp3` | 0.92초 | Lv.7·최종 고유 공격 폭발 | 제작자 직접 생성(원본 합성음) |
| `sfx-boss-die.mp3` | 1.65초 | 보스 처치 | 제작자 직접 생성(원본 합성음) |
| `sfx-gem.mp3` | 0.6초 | 경험치 획득 | 제작자 직접 생성(원본 합성음) |
| `sfx-ui-tap.mp3` | 0.13초 | 설정 켤 때 확인음 | 제작자 직접 생성(원본 합성음) |

묶음 안내문(`README.txt`): "original procedural synthesis outputs, not sampled from existing games". 모노 44.1kHz 128kbps.

## 속성 8종 · 배경 음악 3곡 (2026-11-20)
출처: 제작자 직접 작곡·합성(2026-11-20). 묶음 안내문(`README_AUDIO.md`): "Original algorithmic synthesis & composition … No third-party samples, imported tracks, or copyrighted melodies used." 효과음 모노·배경 음악 스테레오, 32kHz 128kbps.

| 파일 | 쓰는 곳 |
|---|---|
| `sfx-ice-shard.mp3` | 얼음 파편 스킬, 블루 기본 공격, 블루 전용 액티브 |
| `sfx-thunder-breath.mp3` | 번개 숨결 스킬, 옐로 기본 공격·전용 액티브 |
| `sfx-wing-wind.mp3` | 날개 폭풍 스킬, 윈드 기본 공격·전용 액티브 |
| `sfx-water-blast.mp3` | 워터 기본 공격·전용 액티브 |
| `sfx-shadow-magic.mp3` | 블랙·아케인 기본 공격·전용 액티브 |
| `sfx-heal.mp3` | 회복 물약, 엘리트 처치 회복, 용의 만찬 카드, 화이트 전용 액티브 |
| `sfx-coin-pickup.mp3` | 보물 더미 카드(골드) |
| `sfx-shield.mp3` | 용의 수호막 획득·막음, 스톤 전용 액티브 |
| `public/bgm/bgm-lobby-fantasy.mp3` | 시작 화면 터치 뒤·로비·메뉴 화면(화면끼리 이동해도 끊기지 않음) · 100 BPM 19.2초 반복 |
| `public/bgm/bgm-battle-adventure.mp3` | 전투 시작 · 140 BPM 13.7초 반복 |
| `public/bgm/bgm-boss-crown.mp3` | 보스 경고(5:40)부터 · 128 BPM 15초 반복 |

## 요청서 5 1차 납품 18종 (2026-11-21)
출처: 제작자 직접 합성(묶음 `Dragon-Force-Request5-part1-FX10-SFX18.zip`). 묶음 안내문(`README_ASSETS.md`): "오리지널 전자 합성음, 44.1kHz 모노 MP3. WAV 합성→MP3 인코딩". 다른 게임 소리·샘플 사용 없음.

| 파일 | 쓰는 곳 |
|---|---|
| `sfx-wind-blade` | 윈드 전용 스킬 회전 칼날 타격 |
| `sfx-fire-ground` | 레드 전용 스킬 바닥 불길 |
| `sfx-sig-ready` | 전용 스킬 준비 완료 |
| `sfx-gem-big` | 큰 경험치 보석·경험치 자석 |
| `sfx-reward` · `sfx-reward-rare` · `sfx-claim` | 보상 팝업(받기 소리 → 일반/희귀 등장음) |
| `sfx-essence` | 상자 결과 드래곤 정수 |
| `sfx-dragon-unlock` | 새 드래곤 해금 축하 |
| `sfx-day7` | 출석 7일차(상시 출석이 생기면, 지금은 미사용) |
| `sfx-ui-confirm` · `sfx-ui-error` | 성공 문구(레벨 업·승급 등) · 처리 불가 안내 |
| `sfx-boss-enrage` | 보스 광폭화·최종 광폭화·한 마리 처치 후 분노·제한시간 격노 |
| `sfx-danger-zone` | 어려움 8단계 위험 지대 생성(음량 70%) |
| `sfx-hard-clear` | 어려움 20단계 전용 클리어 연출 |
| `sfx-boss-double` | 보스 2마리 등장 경고 |
| `sfx-elite-split` | 엘리트 무리 중 한 마리 처치(어려움) |
| `sfx-hard-start` | 어려움 시작 스킬 고르기 화면 |

보상·화면 소리 8개는 로비에서 미리 읽고(`UI_SFX_FILES`), 나머지는 전투에서 읽는다. 동시 효과음 8개·같은 소리 최소 간격 규칙 그대로(보스 겹침 대비).

## 음량·길이 규칙(코드 `src/systems/Sfx.ts`·`Music.ts`)
- 채널 기본 음량: 배경 음악 0.35 · 전투 0.35 · 보상 0.6 · UI 0.45(기획 10.2).
- **기본 공격 발사음**(화염탄 등)은 1~1.2초마다 나는 가장 잦은 소리라 **앞 0.3초만, 음량 60%**(끝 0.08초는 줄여 끔) — 제작자 요청 "계속 들으면 피곤". 파일은 그대로 두고 코드에서 자름.
- 액티브 스킬 발동음은 0.45초까지, 음량 80%.
- 곡 바꿀 때 0.7초 페이드. 결과 화면에서 곡을 줄여 끔.
- 같은 소리 최소 간격(적중 60ms 등), 동시 효과음 8개.
- 남은 확인: 실제 기기에서 곡 반복 이음매(MP3 앞뒤 공백), 소리 크기 균형.

## 소리 설정
로비 오른쪽 "설정" → 소리(효과음·배경 음악) 켜기/끄기(제작자 결정 2026-11-20, 첫 제출은 이것만). 저장 키 `dragon-force:settings`(진행 저장과 따로), 앱을 다시 켜도 유지. 끄면 파일·합성음 모두 안 남.

## 소리 요청서 9 — 23종 (2026-11-24, `docs/SOUND_REQUEST_9.md`)
제작: 제작자가 맡긴 생성 도구에서 **외부 음원 없이 파형을 직접 프로그래밍 합성**(Python NumPy/SciPy → SoundFile WAV → FFmpeg/libmp3lame MP3 160kbps), 44.1kHz 모노. 음악·녹음·제3자 효과음 라이브러리 미사용 → 상업 이용 가능(직접 생성). 원본 WAV·제작 기록은 납품 압축 파일(`DragonForce_SFX_23.zip`)에 있음(저장소에는 MP3만).

| 파일 | 제작 | 날짜 |
|---|---|---|
| `sfx-aurora-shot.mp3` | 직접 파형 합성 | 2026-11-24 |
| `sfx-mirror-ping.mp3` | 직접 파형 합성 | 2026-11-24 |
| `sfx-chrono-shot.mp3` | 직접 파형 합성 | 2026-11-24 |
| `sfx-void-shot.mp3` | 직접 파형 합성 | 2026-11-24 |
| `sfx-sand-shot.mp3` | 직접 파형 합성 | 2026-11-24 |
| `sfx-steel-disc.mp3` | 직접 파형 합성 | 2026-11-24 |
| `sfx-bloom-pop.mp3` | 직접 파형 합성 | 2026-11-24 |
| `sfx-howl-pulse.mp3` | 직접 파형 합성 | 2026-11-24 |
| `sfx-crimson-slash.mp3` | 직접 파형 합성 | 2026-11-24 |
| `sfx-aurora-sweep.mp3` | 직접 파형 합성 | 2026-11-24 |
| `sfx-mirror-clone.mp3` | 직접 파형 합성 | 2026-11-24 |
| `sfx-chrono-tick.mp3` | 직접 파형 합성 | 2026-11-24 |
| `sfx-chrono-boom.mp3` | 직접 파형 합성 | 2026-11-24 |
| `sfx-void-hole.mp3` | 직접 파형 합성 | 2026-11-24 |
| `sfx-sand-swamp.mp3` | 직접 파형 합성 | 2026-11-24 |
| `sfx-steel-swords.mp3` | 직접 파형 합성 | 2026-11-24 |
| `sfx-bloom-thorns.mp3` | 직접 파형 합성 | 2026-11-24 |
| `sfx-howl-roar.mp3` | 직접 파형 합성 | 2026-11-24 |
| `sfx-crimson-drain.mp3` | 직접 파형 합성 | 2026-11-24 |
| `sfx-roulette-tick.mp3` | 직접 파형 합성 | 2026-11-24 |
| `sfx-roulette-win.mp3` | 직접 파형 합성 | 2026-11-24 |
| `sfx-roulette-jackpot.mp3` | 직접 파형 합성 | 2026-11-24 |
| `sfx-key-use.mp3` | 직접 파형 합성 | 2026-11-24 |

## Higgsfield 효과음 7종 (2026-11-26, 없던 순간)
출처: Higgsfield MCP `mirelo_text_to_audio`(텍스트 → 효과음, AI 생성, 한 개 0.75크레딧). 다른 게임 소리·샘플을 쓰라고 하지 않았고 요청문은 모두 일반 묘사("오리지널 멜로디"). 원본 `art-src/sfx/hf-<키>.mp3`(메인 폴더), 게임 `public/sfx/<키>.mp3`.

| 키 | 언제 | 길이 | 크기 맞춤(fileVol) |
|---|---|---|---|
| sfx-warn | 엘리트·보스 경고(뿔피리 + 북) | 2.0초 | 1.2 |
| sfx-boss-appear | 보스 등장(포효 + 땅울림) | 2.5초 | 0.75(원본이 큼) |
| sfx-victory | 클리어 결과 화면(팡파르) | 3.0초 | 1.5 |
| sfx-defeat | 실패 결과 화면(포기 제외) | 2.5초 | 1.0 |
| sfx-battle-start | 전투 시작(뿔피리 + 날갯짓 + 칼 뽑기) | 2.0초 | 1.2 |
| sfx-cape-unfurl | 스킨 망토가 펼쳐질 때 | 1.5초 | 2.6(원본이 작음) |
| sfx-upgrade | 강화·레벨 업·승급 성공 글자(`popWord`) — 예전 sfx-ui-confirm | 1.5초 | 2.0 |

같이 연결(새 파일 없음): 겨울 축제 룰렛 결과(정수 = sfx-roulette-jackpot, 나머지 = sfx-roulette-win), 출석 7·14·21·28일 받기 = sfx-day7(있었지만 안 쓰던 소리).
