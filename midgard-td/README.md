# 미드가르드 엽사단 (타워 디펜스, 1단계)

브라우저에서 바로 실행되는 2D 타일형 타워 디펜스 게임입니다. HTML/CSS/JavaScript만 사용합니다.

## 실행 방법

### 가장 쉬운 방법 (PC)
1. `midgard-td` 폴더 전체를 내 컴퓨터에 받습니다. (GitHub에서 **Code → Download ZIP** 후 압축 풀기)
2. `midgard-td/index.html` 을 **더블클릭**하면 크롬/엣지에서 열리고 바로 시작됩니다.
   - 로컬 서버가 필요 없도록 만들었습니다. 이미지도 그대로 불러옵니다.

### (선택) 로컬 서버로 열기
더블클릭으로 이상하게 보이면 아래 중 하나를 쓰세요.
- **VS Code**: 확장 프로그램 "Live Server" 설치 → `index.html` 우클릭 → *Open with Live Server*
- **파이썬이 있으면**: `midgard-td` 폴더에서 터미널을 열고 `python -m http.server 8000` → 브라우저에서 `http://localhost:8000`

### 휴대폰에서 하기
휴대폰은 파일을 직접 열기 어렵습니다. GitHub Pages 같은 무료 호스팅에 올린 뒤 주소로 접속하세요. 가로 화면 권장.

### 조작
- 캐릭터 카드를 맵의 **빛나는 칸**으로 끌어다 놓기 (또는 카드 탭 → 칸 탭)
- 배치된 캐릭터를 누르면 **[스킬] / [퇴각]** 메뉴
- 강화 탭(page 2): 전체 카드는 탭하면 구매, 개별 캡슐은 캐릭터에게 끌어다 놓기
- `Esc` 일시정지, `Space` 2배속

진행 상황(레벨·별·연)은 브라우저에 자동 저장됩니다. 지우려면 타이틀의 **저장 데이터 초기화**.

## 폴더 구성

```
midgard-td/
├─ index.html          ← 이 파일을 열면 실행
├─ css/style.css       ← 화면 꾸밈
├─ js/                 ← 게임 코드 (보통 고칠 필요 없음)
├─ data/               ← ★ 숫자를 바꾸는 곳
│  ├─ config.js        코스트·기지 체력·웨이브 간격·별 기준·레벨업·등급표·지휘관 스킬·직군
│  ├─ characters.js    캐릭터 능력치·스킬
│  ├─ animations.js    애니메이션 프레임 수·속도·명중 프레임·그림 크기
│  ├─ enemies.js       적 능력치
│  ├─ cards.js         강화 카드
│  └─ stages.js        맵·웨이브·보상·튜토리얼 문구
├─ assets/
│  ├─ portraits/       일러스트 (넣어 두었습니다)
│  ├─ sprites/<id>/    전투용 SD 애니메이션 프레임
│  ├─ enemies/         적 이미지 (선택)
│  └─ effects/         투사체 이미지 (선택)
└─ reference_sheets/   보내주신 SD 시트 원본 (게임에서는 사용 안 함, 잘라 쓰기용)
```

data 파일은 메모장으로 열어 숫자만 바꾸고 저장 → 브라우저 새로고침(F5) 하면 반영됩니다.
쉼표(`,`)와 따옴표(`'`)는 지우지 않도록 주의하세요.

## 이미지 넣는 위치

캐릭터 id: `ara`(아라) `vivian`(비비안) `riri`(리리) `amelie`(아멜리) `sheba`(셰바) `hana`(하나)

| 종류 | 위치와 파일 이름 | 비고 |
|---|---|---|
| 일러스트 | `assets/portraits/<id>.png` | 이미 넣어 둠. 카드엔 얼굴 부분만 잘려 나옴 (`characters.js`의 `face`로 위치 조정) |
| SD 애니메이션 | `assets/sprites/<id>/<동작>_<번호>.png` | 예: `assets/sprites/amelie/idle_1.png` … `idle_7.png` |
| 적 | `assets/enemies/<적id>.png` | 예: `assets/enemies/fuzz.png` |
| 투사체 | `assets/effects/<id>_bullet.png` | 예: `assets/effects/amelie_bullet.png` (오른쪽을 향한 그림) |

- 동작 이름: `idle`(대기) `attack`(공격) `skill`(스킬) `heal`(회복, 하나) `fallen`(쓰러짐)
- **배경이 투명한 PNG**, 캐릭터는 **오른쪽을 보는 그림**으로 넣어 주세요. 한 동작의 프레임들은 같은 크기로 잘라야 흔들리지 않습니다.
- 프레임 수를 바꾸면 `data/animations.js`의 `frames`도 같이 바꿔 주세요. 크기가 안 맞으면 `height`(칸 단위)와 `offsetY`로 조정.
- 이미지가 없으면 자동으로 대체됩니다: 스킬 없음 → 공격+빛 / 회복 없음 → 공격 / 공격 없음 → 대기+번쩍임 / 쓰러짐 없음 → 서서히 사라짐 / 전부 없음 → 직군 색 원 + 얼굴 + 이름

보내주신 SD 시트에서 잘라야 할 프레임 (원본은 `reference_sheets/`에 보관):

| 캐릭터 | 대기 | 공격 | 스킬 | 회복 | 쓰러짐 |
|---|---|---|---|---|---|
| amelie | idle 1~7 | attack 1~4 (캐릭터가 있는 앞 4칸) | skill 1~7 | | fallen 1~6 |
| sheba | idle 1~7 | attack 1~4 | skill 1~6 | | fallen 1~6 |
| vivian | idle 1~4 | attack 1~6 | | | fallen 1~5 |
| hana | idle 1~4 | | | heal 1~6 | fallen 1~5 |
| ara | idle 1~3 | attack 1~6 | | | fallen 1~3 |
| riri | idle 1~4 | attack 1~5 (ATTACK 2 회전) | skill 1~5 | | fallen 1~2 |

아멜리·셰바 시트의 공격 줄 뒤쪽 탄환 그림은 잘라서 `assets/effects/amelie_bullet.png`, `sheba_bullet.png`로 쓰면 됩니다.

## 이번 단계에 들어간 것
- 타이틀 → 작전 선택(별 표시) → 출전 확인(6명 고정) → 전투 → 결과(별·경험치·연·레벨업)
- 엽사 명단: 일러스트, 레벨, 경험치 바, 능력치, 스킬 설명
- 전투: 타일 맵, 드래그/탭 배치, 저지, 자동 공격, 스킬·퇴각, 쓰러짐과 재배치 대기, 코스트, 강화 카드 상점과 카드 뽑기, 캡슐 체력 감소(보라 테두리), 지휘관 스킬, 웨이브 예고, 승패·별 평가, 일시정지·2배속
- 스테이지 1(튜토리얼 안내 포함), 스테이지 2(출현 지점 2곳, 보스 왕관 두꺼비)
- 자동 저장, 엽사 등급 데이터(자~흑, 승급 심사는 다음 단계)
