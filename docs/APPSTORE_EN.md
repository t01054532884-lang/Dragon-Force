# App Store 영어 페이지 초안 (2026-11-25, AI 작성 · 제작자 검토 전)

App Store Connect → 앱 → 배포 → 오른쪽 위 언어 메뉴에서 **English (U.S.)** 를 추가하고 아래 칸을 붙여 넣는다. 앱은 하나(한국어·영어 같은 앱, 시트 '초기비용' 탭 1절 확정). 글자 수는 App Store 제한 안으로 맞췄다.

## 붙여 넣을 칸
| 칸 | 제한 | 내용 |
|---|---|---|
| 이름 Name | 30자 | `Dragon Force: Survivor` (22자) |
| 부제 Subtitle | 30자 | `Dragon roguelike survival` (25자) |
| 프로모션 텍스트 Promotional Text | 170자 | `Dragon Winter Festival is here! From Dec 1 to Dec 31, play to spin the Festival Roulette and collect limited rewards.` (약 120자, 12/1 전 제출이면 축제 문구 대신 아래 대체 문구) |
| 프로모션 텍스트(축제 전) | 170자 | `Drag to fly, your dragon fights on its own. Survive the swarm, beat the boss, and build a new combo every run.` (110자) |
| 키워드 Keywords | 100자 | `dragon,roguelike,survivor,action,shooter,fantasy,boss,idle,auto,one hand,rpg,monster,arcade` (93자) |
| 지원 URL | | https://t01054532884-lang.github.io/Dragon-Force/support-en.html |
| 개인정보처리방침 URL | | https://t01054532884-lang.github.io/Dragon-Force/privacy-en.html |
| 저작권 | | `© 2026 [상호 SquadCode 또는 이름]` |

- 이름: "Dragon Force"만 쓰면 같은 이름의 앱·상표와 겹칠 수 있다(유튜브도 'DragonForce' 이름을 막았음). 그래서 `: Survivor`를 붙였다. 한국어 이름 "드래곤 특공대"와 따로 정할 수 있다. 다른 게임 이름은 이름·키워드에 넣지 않는다(심사 2.3.7).
- 키워드는 이름·부제에 이미 있는 낱말(dragon·survivor·roguelike)을 다시 넣어도 점수가 오르지 않으니, 자리가 모자라면 그것부터 뺀다.

## 설명 Description (4,000자 제한)
```
Become a dragon and take back the sacred lands from monsters corrupted by the shards of the Black Crown.

• ONE-HAND CONTROL
Drag anywhere to fly. Your dragon attacks on its own.

• A NEW BUILD EVERY RUN
Each level-up, pick one of three skill cards — Fire Breath, Lightning Breath, Dragon Meteor and more — and stack them into your own combo.

• ULTIMATE SKILLS
Charge your dragon's ultimate and unleash a screen-wide cinematic strike.

• ELITES AND BOSSES
Survive the waves, take down two elites, then face the stage boss. At half health, bosses enter Phase 2.

• 19 DRAGONS TO COLLECT
Red, Blue, Yellow, Green and many more — each with its own basic attack, signature skill and growth path.

• 20 STAGES, TWO DIFFICULTIES
Clear Easy to unlock Hard, with tougher arenas, enemies and better rewards.

• LONG-TERM GROWTH
Upgrade your dragons in the Lab, equip gear and runes, and dress them up with cosmetic skins.

• FAIR ODDS
All chest odds and guarantee rules are shown in the game.

• PLAY IN ENGLISH OR KOREAN
The game follows your device language. You can switch anytime in Settings.

Link your Apple account to keep your progress when you change devices.
```
- 제작자 확인: 숫자(19종·20단계·엘리트 2마리)와 "필살기"·"보스 2페이즈" 문장은 제출 빌드에 실제로 들어갔을 때만 남긴다. 보스 2페이즈 변신 그림·필살기 영상이 제출 뒤 업데이트면 해당 줄을 빼거나 "더 강한 패턴"으로 바꾼다.
- 결제를 빼고 먼저 출시하면 그대로 써도 된다(결제 관련 문장 없음).

## 심사 메모 App Review Notes (영문, 이번 빌드 기준으로 바꿈)
```
Dragon Force is a single-player roguelike survival game.
- Controls: drag anywhere to move; attacks are automatic.
- Account: a guest account is created automatically (Firebase anonymous auth). Users can link Sign in with Apple in Settings, and delete the account in Settings → Delete Account (Apple token is revoked).
- In-app purchases: Rubies, bundles, perks, passes and Skin Keys (consumables). Chest and roulette odds are disclosed in the shop ("Odds · Guarantees"). The Skin Roulette draw runs on our server.
- Language: Korean and English, following the device language; switch in Settings → Language.
- The "Winter Festival" event screens are a limited-time event from Dec 1 to Dec 31 and are hidden outside that period.
- No ads, no tracking, no analytics.
```
- 결제 없이 먼저 출시하면 In-app purchases 줄을 `No in-app purchases in this version.`으로 바꾼다.

## 앱 개인정보(영양 라벨) — 이제 "수집 안 함"이 아님
지금 빌드는 게스트 계정·클라우드 저장·(결제를 켜면) 구매 기록이 서버로 간다. `docs/APPSTORE.md`의 "데이터를 수집하지 않음"은 서버 없던 때 기준이라 바꿔야 한다. App Store Connect → 앱 개인정보에서:

| 데이터 종류 | 체크 | 사용자와 연결 | 추적 | 목적 |
|---|---|---|---|---|
| 식별자 → 사용자 ID | ✅ | 예 | 아니오 | 앱 기능 |
| 구입 항목 → 구입 내역 | 결제를 켠 빌드만 ✅ | 예 | 아니오 | 앱 기능 |
| 기타 데이터 → 기타 데이터 유형(게임 진행 기록) | ✅ | 예 | 아니오 | 앱 기능 |

- 이름·이메일은 받지 않는다(Apple 로그인에서 요청하지 않음). 분석 도구를 넣으면(기획서 P0 이벤트표) "사용 데이터 → 제품 상호 작용"이 추가되고 처리방침 4절도 고쳐야 한다.

## 스크린샷 (영어)
- 6.9인치 1320×2868, 3~10장. 영어 모드로 바꾼 실제 게임 화면을 AI가 캡처(제작자 결정 2026-11-21, 한국어판과 같은 방식).
- 영어 로고 그림이 오기 전이면 타이틀 화면 사진은 빼고 전투·로비·드래곤·상점 화면 위주로.
