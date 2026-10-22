# itch.io 업로드 안내 — SHADOW PULSE

## 준비된 파일
- `shadow-pulse-itch-html5.zip`: **게임 업로드용 ZIP. 압축을 풀지 말고 이 파일을 업로드하세요.** 루트에 index.html이 있습니다.
- `images/cover.png`: 게임 목록 대표 이미지. AI 생성 홍보용 일러스트.
- `images/banner.png`: 페이지 상단 배너. AI 생성 홍보용 일러스트.
- `screenshots/`: 실제 게임 화면 3장. 커버를 실제 플레이 화면으로 등록하지 마세요.
- `STORE_KO.md` / `STORE_EN.md`: 한국어·영문 소개문. 대응 HTML 파일은 itch.io 본문의 HTML 편집 모드용입니다.
- `CONTROLS.md`: 상세 조작표.
- `press-kit.zip`: 소개문·조작표·이미지를 모은 공유용 파일. 게임 실행용 ZIP이 아닙니다.
- `RELEASE_CHECKLIST.md`: 공개 전 확인할 사항과 외부 서비스 의존성.

## 등록 순서
1. itch.io 로그인 후 Dashboard → Create new project를 엽니다.
2. Title: **SHADOW PULSE**. Project URL 제안: **shadow-pulse**. 사용 가능 여부는 itch.io에서 확인하세요.
3. Classification: **Games**, Kind of project: **HTML**, Release status: **In development**로 설정합니다.
4. Short description에 STORE_KO.md 또는 STORE_EN.md의 한 줄 소개를 넣습니다. 실제 게임 언어는 Korean으로 등록하세요. 영문 설명이 있다고 English UI를 지원하는 것은 아닙니다.
5. 초기 배포 가격 제안은 **무료 / No payments**입니다. 유료화·후원 설정은 소유자가 결정하세요.
6. 게임 ZIP을 올리고 **This file will be played in the browser**를 선택합니다.
7. Embed options: **Click to launch in fullscreen** 권장. 페이지 내 임베드를 쓰면 **1280×720**, Click to Play 켜기, Fullscreen button 켜기, Scrollbars 끄기를 권장합니다. Mobile friendly는 실제 모바일 기기 검수 후에 선택하세요.
8. Cover image에는 images/cover.png를 넣습니다. 대표 이미지와 배너는 AI 홍보 일러스트라고 소개문에 이미 명시되어 있습니다.
9. screenshots 폴더의 01→02→03 순서로 실제 플레이 화면을 올립니다. Edit theme에서 images/banner.png를 Header로 사용하세요.
10. 상세 소개를 본문에 붙여넣습니다. HTML 파일을 쓰려면 itch.io 편집기의 HTML 모드를 사용하세요. 태그 제안: **3d, action, third-person, physics, parkour, multiplayer, singleplayer, superhero**. 검색 결과와 등록 가능 태그를 확인해 선택하세요.
11. 테마 제안: 배경 #07121D, 본문 #101C30, 글자 #F3F4FF, 강조 #B78AFF. 기본 itch.io 테마 편집기로 적용할 수 있습니다.
12. 우선 **Draft**로 저장합니다. 아래 확인과 RELEASE_CHECKLIST.md의 에셋 권리 확인을 마친 뒤 공개 여부를 결정하세요.

## 실제 업로드 후 확인
- 페이지에서 Launch game → 혼자 플레이 → 이동·점프·양손 와이어·H·M·Esc.
- 전체화면, 카메라 잠금과 해제, 도시 전환. 저장을 막은 브라우저에서도 실행되는지 확인.
- 서로 다른 두 브라우저/기기에서 방 만들기와 코드 입장, 경찰과 도망자 시작.
- 홍콩 로딩과 지도 출처 표시, 외부 서비스 장애 시 로컬 도시로 전환.
- 게임 UI가 한국어라는 표시, 실제 스크린샷과 홍보 일러스트의 구분.

이 패키지는 로컬 모의 itch.io iframe에서 검수했습니다. 실제 itch.io CDN에 업로드하거나 프로젝트를 공개하지 않았습니다. CDN에서의 최종 검수는 업로드 후 필요합니다.

## 개발자가 다시 빌드할 때
프로젝트 루트에서 `npm run build:itch`를 실행합니다. ZIP과 build-manifest.json을 재생성합니다. 문구와 이미지는 유지됩니다. `npm run preview:itch`로 http://127.0.0.1:4187/ 모의 iframe을 열 수 있습니다. 실행 중인 동일 포트 서버가 있다면 먼저 해당 검수 서버를 종료하세요.
일반 `npm run build`와 dist는 별도입니다. itch.io용 빌드는 전용 vite.itch.config.js를 사용합니다.

## 공식 참고
- HTML5 업로드·파일 제한·임베드: https://itch.io/docs/creators/html5
- 페이지 디자인·소개·이미지: https://itch.io/docs/creators/design
