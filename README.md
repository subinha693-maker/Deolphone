# 흰 공간 30일 — 안드로이드 앱 브랜치

이 브랜치는 게임 「흰 공간 30일」 전용입니다. (main 브랜치의 덜폰과는 관계없음)

- `site/web/` — 게임 파일. 앱은 켤 때마다 `site/web/version.json` 을 읽고 바뀐 파일만 받아 적용합니다.
- `app/` — 안드로이드 앱(게임 창). 게임 파일은 APK 에도 들어 있어 인터넷 없이 실행됩니다.
- APK: 릴리스 `whitespace-latest` (이 브랜치에 올릴 때마다 GitHub Actions 가 새로 만듦)
- 서명 키는 저장소에 올리지 않습니다. 저장소 Settings → Secrets and variables → Actions 에
  `WS_KEYSTORE_B64`, `WS_KEY_PASSWORD` 를 넣으면 같은 키로 서명되어 새 APK 를 덮어 설치할 수 있습니다.
