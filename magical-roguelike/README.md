# 황혼의 마법소녀 원정대 — 분기형 탐사 마법소녀 로그라이크 (프로토타입)

2D 횡스크롤 자동 전투 + 분기형 탐사 맵 + 유물 시너지를 결합한 로그라이크 파티 RPG의 플레이 가능한 MVP입니다.
빌드 도구 없이 순수 HTML5 Canvas + JavaScript로 동작합니다.

## 실행 방법

```bash
cd magical-roguelike
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

`index.html`을 파일로 직접 열어도 동작합니다(모듈/fetch를 사용하지 않음). 글꼴(Gowun Batang)만 인터넷이 필요하며, 없으면 기본 명조체로 표시됩니다.

로직 테스트(브라우저 불필요):

```bash
node tests/run-tests.js
```

스프라이트/UI 리소스 재생성(원본 시트는 `tools/source/`):

```bash
pip install pillow numpy scipy
python3 tools/extract_sprites.py   # 캐릭터 시트 → assets/sprites/*.png + js/data/spriteData.js
python3 tools/extract_ui.py        # 대화창/선택지 참고 이미지 → assets/ui/*.png
```

## 조작

| 동작 | 방법 |
| --- | --- |
| 경로 선택 | 탐사 맵에서 빛나는 노드 클릭 → `진입` |
| 스킬 | 배치 카드의 스킬 버튼, 또는 `Q` `W` `E` `R` (상단 전열/후열, 하단 전열/후열) |
| 교대 | 대기열 카드 클릭 → 배치 칸 클릭 (반대 순서도 가능) |
| 진형 변경 | 진격로 오른쪽의 `⇄ 진형` (전열 ↔ 후열) |
| 진격로 이동 | 배치 카드의 `↕`, 또는 배치 칸 → 다른 진격로 칸 순서로 누르기 (2초간 전투 이탈) |
| 전열 ↔ 후열 | `⇄ 진형`, 또는 배치 칸 → 같은 진격로의 다른 칸 순서로 누르기 |
| 대기열로 퇴각 | 배치 칸을 누른 뒤 대기열 위의 `↓ 대기열로 퇴각` (교대 대기시간 적용) |
| 일시정지 / 배속 | `Space` / 상단 `속도 ×1·×2` |
| 유물·시너지 목록 | 상단 `유물 · 시너지` 버튼 |
| 탐사 맵 편성 / 물약 | 맵 하단 파티 카드 두 장을 차례로 클릭해 자리 교환, `⚱` 로 물약 사용 |

## 구현된 기능

### 심도 (제 1 ~ 5심도)
- 한 탐사 맵의 최종 전투를 이기면 보상(희귀 유물·개조)을 고른 뒤 다음 심도의 새 맵으로 내려갑니다. 파티·유물·개조·별조각은 유지되고, 살아 있는 아군은 체력 30% 회복.
- 심도마다 노드 난이도 +1. 최종 전투: 1~2심도는 흑철 기사가 이끄는 문지기 전투, **가시관의 주교는 3심도부터** 등장, 5심도는 주교 두 명.
- 제 5심도 최종 전투를 이기면 탐사 완료. 돌파한 심도마다 월광 +15. 심도 정보는 `MG.DEPTHS`(`js/data/config.js`), 최종 웨이브는 `MG.FINAL_WAVES_BY_DEPTH`(`js/data/nodes.js`).

### 기본 루프
- **게임 상태 머신** (`GameManager`): TITLE → PARTY_SELECT → MAP → NODE_ENTER → BATTLE / EVENT / REST / RELIC / SHOP / RECRUIT → REWARD → NODE_COMPLETE → MAP / RUN_CLEARED / RUN_FAILED. SANCTUARY, CODEX 화면도 같은 상태 머신을 거칩니다. 허용되지 않은 전환은 거부됩니다.
- **전투 노드 흐름** (`WaveManager`): 전진 → 적 출현·자동 전투 → 웨이브 클리어 → 재전진 → … → 노드 클리어 → 보상. 웨이브 종료는 "스폰 완료 + 생존 적 0"으로만 판정합니다.
- **분기형 탐사 맵** (`MapManager`): 8단계 그래프, 분기·합류 보장. 노드: 일반 전투, 방어전, 강적, 유물, 사건, 휴식, **상점**(3~5열에 최소 1개 보장), **동료**(1~3열에 1개 보장), 최종 보스전.
- **두 진격로, 교대, 진형, 진격로 이동, 스킬** (`LaneManager`, `PartyManager`, `FormationSystem`, `SkillSystem`).

### 마법소녀 11명
- 기존 6명 + 신규 5명: **세린**(빙결 참격, 돌격), **노아**(공허 붕괴·처형, 사격), **엘리시아**(천상의 깃털·지속 회복, 지원), **세실리아**(성흔의 기도·피해 감소, 수호), **네로**(초승달 사냥·다중 타격, 사격).
- 시작 파티 4명 선택(앞 3명 전장 + 1명 대기, 역할에 따라 전열/후열 자동 배치), "추천 구성", 직전 구성 기억.
- 동료 노드에서 후보 2명 중 1명 영입(최대 6명). 실피·청련은 별빛 성소에서 해금.

### 유물 34종 · 시너지 14종 · 스킬 개조 33종 (재미 확장 ①)
- 희귀도 일반 / 희귀 / **전설** / **저주**(이득 + 대가). 태그: 불속성·수호·교대·스킬·진격로·회복·폭딜 (`MG.TAG_NAMES`).
- 신규 유물 21종(진격로·수호/회복·스킬/폭딜·전설·저주), 신규 시너지 8종(태그 기반 `수호의 맹세`·`비전의 맹세` 포함).
- 스킬 개조: 캐릭터당 3개, `SkillSystem.effective(unit)`이 기본 스킬에 개조를 덮어써 쿨다운·툴팁·실제 효과에 모두 반영.
- 보상 구성: 일반 전투 = 유물 3 + 개조 1 + 보조 1, 강적 = 유물 3 + 개조 2.
- **상점**: 유물 3 + 개조 2 + 물약 + 치유의 성수, 새로고침(8 → +4), 할인/난이도 가격 반영, SOLD 표시.

### 확장 ② (1~6단계)
1. **저장** (`SaveManager`): localStorage + 메모리 폴백, 손상본 백업(`mg_save_corrupt`), 내보내기/불러오기 문자열, 2단계 확인 초기화. 저장이 막힌 환경이면 타이틀에 경고.
2. **오디오** (`AudioManager`): Web Audio로 효과음 30여 종 + 배경음 6곡(타이틀/맵/전투/보스/사건·휴식/상점)을 실시간 합성. 마스터/효과음/배경음 볼륨, 음소거, 일시정지 시 덕킹. 전투 소리는 `battle.bus` 이벤트 구독으로만 연결.
3. **웨이브 예고**: 전투 중 NEXT 패널(진격로별 적 아이콘·수·강적/보스/비행/원거리), 강적·보스 출현 2초 전 경고, 보스 소환 1초 전 경고. 웨이브 계획은 노드별 하위 RNG로 미리 결정되어 맵 미리보기와 실제 전투가 일치하고 `run.rng`를 소비하지 않음. 정찰 등급 L0/L1/L2 ("정찰 보고서", 인형 행상, 성소 "정찰 숙련").
4. **사건 28개**(유물 획득 사건 5개 포함): 신규 연산(`mod`, `removeCurse`, `sacrificeRelic`, `runBonus`, `nextBattles`, `ambush`, `flag`, `discount`, `recruit`, `reviveOne`, `relicChoice`, `wish`, `allShards`), 조건(`require`/`when`), 연쇄 3개(인형 행상, 거울, 편지), 발화자 가중치 ×2·부재 시 다른 동료가 대사.
5. **파티 선택 + 영입** (위 참조).
6. **영구성장**: 월광(런 종료 시 실패해도 지급, 결과 화면에 내역), 별빛 성소 23개 업그레이드(탐사/전투/보상/해금, 선행 조건·상한), 난이도 단계 1~5(첫 클리어마다 해금), 도감(마법소녀/유물/적/사건, 신규 발견 시 월광 보너스).
- **데이터 분리**: 캐릭터, 적, 유물, 시너지, 개조, 노드, 웨이브, 사건, 상점, 성소, 난이도 수치는 모두 `js/data/`.

## 코드 구조

```
js/core/      util(RNG, EventBus) · StateMachine · SaveManager · GameManager
js/data/      config · characters(+스킬 개조) · enemies · relics · nodes(웨이브·상점) · events · meta · spriteData(생성됨)
js/systems/   ExplorationManager · MapManager · NodeManager · WaveManager(+Battle) · LaneManager
              PartyManager · FormationSystem · CombatSystem · SkillSystem · RelicSystem · RewardSystem
              ShopSystem · MetaProgress
js/ui/        AudioManager · Assets · BattleRenderer · SceneArt · UIManager · UIScreens
tests/        run-tests.js (DOM 없이 로직 검증 38개)
tools/        extract_sprites.py · extract_ui.py · source/(원본 이미지)
```

시스템 코드는 DOM에 접근하지 않으므로 Node에서 그대로 테스트할 수 있습니다.

## 아직 없는 기능

- 층(여러 탐사 구역)과 새 적/보스, 업적 보상. 실제 음원 파일(합성음만 있음, `Audio.registerFile`로 교체 가능하게 설계).

## 알려진 문제 / 한계

- 밸런스는 프로토타입 수준입니다. 수치는 `js/data/`에서 조정하세요.
- 바뀐 기본값: 전투 시작 시 스킬 대기시간이 40% → 75% 남은 상태로 시작합니다("마력의 샘"과 성소 "선제 영창"이 의미 있도록).
- 엘리시아·세실리아·네로의 시트는 체크무늬 배경이 이미지에 박혀 있어 전용 추출(체크 색 정밀 판정 + 주변 배경 기준 반투명 복원)을 씁니다. 큰 타격 이펙트 프레임 가장자리에는 약간의 사각 흔적이 남을 수 있습니다.
- 적은 직접 그린 소형 픽셀 아트이며 공격 모션은 돌진과 점멸 정도입니다.
- 유물 아이콘은 유니코드/이모지라 OS 글꼴에 따라 모양이 다를 수 있습니다.
- 화면은 1280×720 고정 비율로 맞춰지고, 세로 화면에서는 90° 회전됩니다.
