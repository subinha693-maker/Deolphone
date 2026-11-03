# 흰 공간 — 프롤로그 (플레이 가능 프로토타입)

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
├─ index.html              화면 골격(대화창, 직업 선택, 상태창, 확인 창 등)과 스크립트 로드 순서
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
│  │  └─ sceneManager.js   장면 등록 · 전환 (goTo). 다음 장면 자리 표시
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
├─ tools/dots.py           쯔꾸르풍 SD 도트 생성기 (캐릭터별 draw_ 함수) → js/render/dots.js, tools/dots_preview.png
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
- 변신 후 도트 모습: `tools/dots.py` 의 `draw_<직업ID>` 수정 후 `python3 tools/dots.py`
- 능력치 · 능력 수치(임시): `js/data/balance.js`
- 새 직업 추가: `jobs.js` 에 항목 추가 + `balance.js` 의 `STATS`/`ABILITIES` 추가 +
  `assets/source/<id>.jpg` 를 넣고 `tools/make_art.py` 목록에 추가 후 실행 + `tools/dots.py` 에 도트 추가
- 특정 회차·엔딩 이후에만 열리게: `unlock: { type: 'loopAtLeast', value: 2 }` 등 (`progression.js` 참고)
- 설정이 확정되면 `draft: true` 를 지우면 화면의 '임시' 표시가 사라진다

## 게임 데이터 흐름

- 새 게임마다 `State.createRun()` 이 상태를 **새로** 만든다 → 이전 플레이의 선택값이 남지 않음
- 직업 확정 → `player.jobId`, `player.stats` 기록
- 각성(섬광 순간) → `player.abilities` 에 직업의 첫 능력 등록, `player.awakened = true`
- `다음 장면으로` → `SceneManager.goTo('chapter1')`. 지금은 전달된 상태를 보여 주는 자리 표시 화면.
  실제 다음 장면은 `sceneManager.js` 의 `WS.SCENES.chapter1` 을 교체하면 된다.
- 회차 간 정보(`loop`, `endingsSeen`, `prologueClears`)만 `localStorage` 에 저장

## 테스트

```
cd game
node tests/e2e.js                 # Playwright 필요 (npm i playwright)
SHOTS=./shots node tests/e2e.js   # 스크린샷도 저장
```

검사 항목: 대사 순서, 선택 전 진행 불가, 확인/취소, 직업별 능력 등록과 각성 외형(5종 전부),
상태창 확인, 연타, 화면 크기 7종에서 대화창/직업 선택창 잘림, 처음부터 다시 시 초기화, 종료 버튼 → 장면 전환.
