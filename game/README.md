# 마법소녀 RPG — 장면별 프로토타입

장면을 하나씩 독립적으로 만들고 나중에 이어 붙이는 방식으로 개발한다.

| 장면 | 파일 | 단독 실행 |
|---|---|---|
| 흰 공간 (프롤로그) | `js/scenes/whiteSpace.js`, 대사 `js/data/script.js` | `index.html` |
| 주인공의 방 | `js/scenes/heroRoom/` (map · script · scene) | `index.html#room` 또는 `index.html?scene=heroRoom&job=ruby` |

시작 화면 아래 **장면 단독 테스트**에서도 장면과 의상(직업)을 골라 바로 시작할 수 있다.
단독 테스트는 직업 선택 · 각성까지 끝난 새 게임 상태로 시작한다.

# 흰 공간 — 프롤로그

어두운 분위기의 마법소녀풍 2D 픽셀 아트 게임의 첫 구간.
게임 시작 → 미레유와의 대화 → 직업 선택 → 각성 → 흰 공간을 떠나기 직전까지 플레이할 수 있다.

- 엔진: 없음 (HTML5 Canvas + 순수 JavaScript). 빌드 과정 없음
- 입력: 터치 / 마우스 / 키보드(Space · Enter · →)
- 화면: 스마트폰 가로, 태블릿, PC. 세로 스마트폰에서는 "가로로 돌려 주세요" 안내

## 실행 방법

1. `game/index.html` 을 브라우저로 연다. (더블클릭, 서버 불필요)
2. 휴대폰에서 하려면 `game` 폴더를 아무 정적 호스팅(GitHub Pages 등)에 올리거나,
   PC에서 `cd game && python3 -m http.server 8000` 실행 후 같은 Wi-Fi의 휴대폰으로 `http://PC주소:8000` 접속.
3. 첫 화면을 탭하면 시작. 휴대폰에서는 시작할 때 전체 화면 + 가로 고정을 시도한다.

## 파일 구성

```
game/
├─ index.html              화면 골격(대화창 · 초상화, 직업 선택, 이름 입력, 조이스틱, 상태창, 확인 창 등)과 스크립트 로드 순서
├─ css/style.css           고딕풍 UI 전체, 화면 크기별 조정
├─ js/
│  ├─ data/                ← 내용 수정은 여기서
│  │  ├─ script.js         대사 스크립트 (텍스트) + 연출 명령
│  │  ├─ characters.js     화자 이름 ↔ 캐릭터, 초상화
│  │  ├─ jobs.js           직업 5종: 이름, 소개, 전투 성향, 장점, 색, 각성 효과, 해금 조건
│  │  ├─ balance.js        ※임시 수치: 직업별 능력치, 능력(위력·마나·대기 턴·효과)
│  │  └─ progression.js    회차 · 해금 조건 · 엔딩 (확장용 뼈대, localStorage 저장)
│  ├─ core/
│  │  ├─ state.js          게임 상태 생성, 직업 적용, 각성 시 능력 등록
│  │  ├─ scriptParser.js   대사 텍스트 → 실행 노드
│  │  ├─ scriptRunner.js   노드 순서 실행, 연출 명령 처리, 재시작 시 이전 실행 중단
│  │  └─ sceneManager.js   장면 등록(registerScene / defineScriptScene) · 전환(goTo)
│  ├─ scenes/              장면 파일들 (장면 하나 = 파일 하나). _template.js 는 새 장면 복사용
│  ├─ render/
│  │  ├─ dots.js           캐릭터 도트 7종 (tools/dots.py 가 자동 생성 — 직접 고치지 말 것)
│  │  ├─ sprites.js        파티클 · 깃털 모양
│  │  ├─ effects.js        흔들림, 섬광, 빛 고리, 파티클
│  │  └─ stage.js          흰 공간 무대: 배치, 깃털·찻잔 김, 분위기, 각성 연출
│  ├─ ui/
│  │  ├─ dialogue.js       대화창: 타자 효과, 탭 진행, 선택지(오입력 방지)
│  │  ├─ jobSelect.js      직업 선택: 목록 · 상세 · 확인/취소
│  │  └─ hud.js            상단 버튼, 상태창, 확인 창, 알림, 장면 전환 베일, 시작 화면
│  └─ main.js              전체 연결, 입력 처리, 새 게임
├─ assets/
│  ├─ source/              제공된 원본 일러스트 (jpg)
│  ├─ portraits/           대화창 · 상태창 초상화 (원본 화질 크롭, 자동 생성)
│  ├─ jobs/                직업 카드 일러스트 (원본 화질, 자동 생성)
│  └─ ui/                  대화창 · 이름표 · 선택지 버튼 · 구분선 (참고 UI 이미지에서 잘라 냄)
├─ tools/dots.py           쯔꾸르 MV 규격 도트 생성기 (캐릭터별 클래스) → js/render/dots.js, tools/dots_preview.png
├─ tools/make_art.py       원본 일러스트 → 초상화 · 직업 카드 (크롭 위치 조정 가능)
├─ tools/extract_ui.py     참고 UI 이미지 → 투명 배경 UI 조각 (글자 지움)
└─ tests/e2e.js            자동 플레이 테스트 (Playwright)
```

## 대사 수정하기 — `js/data/script.js`

받은 대사 스크립트와 거의 같은 형식이다.

```
[미레유]
마음에 드나요?

@show mireille 1600     ← 연출 명령
```

- `[화자]` 다음 줄부터 한 줄 = 대사 한 페이지
- 화자 이름이 어떤 캐릭터인지는 `characters.js` 의 `names` 에 있다 (예: `미레유`, `안내자` → 같은 초상화)
- `{job.name}`, `{ability.name}`, `{player.name}` 은 실행 중 값으로 바뀐다
- 연출 명령: `@fadein`, `@wait`, `@silence`, `@show`, `@hide`, `@mood still|normal`,
  `@jobselect`, `@awaken`, `@notify`, `@set`, `@label`, `@goto`, `@choice … @endchoice`, `@end`
  (자세한 설명은 파일 맨 위 주석)
- 일반 선택지 예:
  ```
  @choice ask_name
  - 이름이 뭐예요? -> ask
  - (아무 말도 하지 않는다)
  - 예전에 만난 적 있죠? -> deja @if secondLoop     ← 2회차 이상에서만 보임
  @endchoice
  ```

## 직업 수정하기

- 이름 · 소개 · 성향 · 장점 · 색 · 각성 파티클: `js/data/jobs.js`
- 변신 후 도트 모습: `tools/dots.py` 의 캐릭터 클래스 수정 후 `python3 tools/dots.py`
- 능력치 · 능력 수치(임시): `js/data/balance.js`
- 새 직업 추가: `jobs.js` 에 항목 추가 + `balance.js` 의 `STATS`/`ABILITIES` 추가 +
  `assets/source/<id>.jpg` 를 넣고 `tools/make_art.py` 목록에 추가 후 실행 + `tools/dots.py` 에 도트 추가
- 특정 회차·엔딩 이후에만 열리게: `unlock: { type: 'loopAtLeast', value: 2 }` 등 (`progression.js` 참고)
- 설정이 확정되면 `draft: true` 를 지우면 화면의 '임시' 표시가 사라진다

## 주인공의 방 (쯔꾸르식 맵 장면)

- 시작 이벤트: 어둠에서 밝아짐 → 침대에서 깨어남 → 의상 확인 → 그림자처럼 흐릿하던 메이어가 드러남(클로즈업) → 첫 대화
- 자유 조사: 이동은 화면 왼쪽 아래 **조이스틱**(마우스로 끌어도 됨) 또는 방향키 · WASD, 조사는 오른쪽 아래 **조사 버튼** 또는 Space · Enter · Z.
  조사할 대상 앞에 서면 조사 버튼이 빛난다
- 조사 대상: 침대 · 책상(손수건 획득, 임시 아이템) · 창문 · 거울 · 책장 · 출입문 · 메이어. 장식(화분 · 러그)에는 표시 없음
- 메이어: 다시 말을 걸면 자기소개를 반복하지 않고 선택지 → "이야기를 계속 듣는다" 로 받은 "다음 스크립트" 진행
- 종료 지점: 다음 스크립트 끝 "다음으로" 버튼 → `heroRoom` 의 `next`(`heroRoom_next`, 미구현) → 임시 연결 지점 화면 (돌아가기 가능)
- 흰 공간 → 방 연결: 아직 하지 않음. 연결하려면 `js/scenes/whiteSpace.js` 의 `next: 'chapter1'` 을 `'heroRoom'` 으로 바꾸면 된다

| 고칠 것 | 파일 |
|---|---|
| 대사 · 조사 문구 · 표정 | `js/scenes/heroRoom/script.js` (`=== 섹션` 단위, 표정은 `[클레어:놀람]`) |
| 가구 배치 · 충돌 · 조사 대상 · 메이어 위치 | `js/scenes/heroRoom/map.js` |
| 아이템 | `js/data/items.js` |
| 표정 이름 ↔ 그림 | `js/data/characters.js`, 크롭 위치는 `tools/make_art.py` |

공통 시스템 (다른 맵 장면에서도 그대로 사용):
`js/map/mapView.js`(이동 · 충돌 · 길찾기 · 조사 표시 · 카메라), `js/map/mapCommands.js`(`@face @walk @wake @reveal @camera @emote`),
스크립트 공통 명령 `@give 아이템` `@event 이름` `@closeup 캐릭터|off` `@nameinput 질문`, 화자 표정 `[이름:표정]` · 별칭 `[???|메이어:기본]`.

세이브 대상 데이터(`game.state`, 화면과 분리): `sceneId`, `position {sceneId,x,y,dir}`, `inventory`,
`scenes.<장면>.inspected`(조사 횟수) · `.events`(진행 이벤트), `choices`, `flags`, `player`.

## 주인공 이름

흰 공간에서 안내자가 이름을 묻고(`@nameinput`), 플레이어가 직접 입력한다 (1~8글자, 확인 후 다시 쓰기 가능).
정한 이름은 `game.state.player.name` 에 저장되고, 주인공의 이름표(`[주인공]` · `[클레어]` 모두)와 대사의 `{player.name}` 에 쓰인다.
조사는 `{player.name:이/가}` `{player.name:이에요/예요}` 처럼 쓰면 받침에 맞춰 자동으로 붙는다.
이름을 정하기 전 · 장면 단독 테스트에서는 기본 이름 `클레어`(`WS.DEFAULT_PLAYER_NAME`).

## 도트 (쯔꾸르 MV 규격)

`tools/dots.py` 가 48x48 칸, 4방향(정면 · 옆 · 뒤, 오른쪽은 좌우 반전) x 3프레임 걷기 도트를 생성한다.
캐릭터: 클레어(평상복) · 메이어 · 미레유(정면만) · 변신 5종. 미리보기 `tools/dots_preview.png`.

## 장면을 따로 만들어 이어 붙이기

장면은 `js/scenes/` 에 파일 하나씩 따로 만든다. 직업 · 능력 · 선택 기록 · 플래그(`game.state`)는 장면이 바뀌어도 그대로 이어진다.

1. `js/scenes/_template.js` 를 `js/scenes/<장면ID>.js` 로 복사하고 대사(`WS.SCRIPTS.<이름>`)와 옵션을 채운다.
2. `index.html` 의 장면 구역에 `<script src="js/scenes/<장면ID>.js"></script>` 한 줄을 추가한다.
3. 연결은 앞 장면 파일에서 `next: '<장면ID>'` 한 줄로 한다. (흰 공간은 `js/scenes/whiteSpace.js` 의 `next` 가 `chapter1` 을 가리킨다.)
   `chapter1.js`(자리 표시)를 새 장면으로 바꾸거나, `next` 를 새 장면으로 돌리면 된다.

장면 옵션: `backdrop(ctx,W,H,stage)` 배경을 직접 그림 / `props:false` 흰 공간 소품 숨김 / `setup` · `teardown` 추가 처리.
전투처럼 대화가 아닌 장면은 `WS.registerScene(id, { enter, exit })` 로 직접 만든다.
스크립트에서는 `@end 버튼문구 -> 장면ID`(장면ID 를 쓰면 그 장면, 생략하면 `next`) 또는 `@goscene 장면ID`(버튼 없이 이동)를 쓴다.

## 게임 데이터 흐름

- 새 게임마다 `State.createRun()` 이 상태를 **새로** 만든다 → 이전 플레이의 선택값이 남지 않음
- 직업 확정 → `player.jobId`, `player.stats` 기록
- 각성(섬광 순간) → `player.abilities` 에 직업의 첫 능력 등록, `player.awakened = true`
- `다음 장면으로` → 흰 공간 장면의 `next`(`chapter1`)로 이동. 지금은 전달된 상태를 보여 주는 자리 표시 화면.
- 회차 간 정보(`loop`, `endingsSeen`, `prologueClears`)만 `localStorage` 에 저장

## 테스트

```
cd game
node tests/e2e.js                 # Playwright 필요 (npm i playwright)
SHOTS=./shots node tests/e2e.js   # 스크린샷도 저장
```

검사 항목: 대사 순서, 선택 전 진행 불가, 확인/취소, 직업별 능력 등록과 각성 외형(5종 전부),
상태창 확인, 연타, 화면 크기 7종에서 대화창/직업 선택창 잘림, 처음부터 다시 시 초기화, 종료 버튼 → 장면 전환.
