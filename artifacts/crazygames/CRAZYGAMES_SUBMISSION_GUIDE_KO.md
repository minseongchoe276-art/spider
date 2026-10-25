# CrazyGames 개발자 포털 제출 가이드 (Shadow Pulse)

크레이지게임즈(CrazyGames) 규격에 맞추어 **용량 압축(50MB 이하 달성)** 및 **CrazyGames SDK v3 공식 연동**이 완료된 전용 배포 패키지입니다.

---

## 1. 빌드 파일 요약
* **업로드용 ZIP 파일 경로:**
  `/Users/choeminseong/Desktop/게임/artifacts/crazygames/shadow-pulse-crazygames.zip`
* **ZIP 파일 용량:** **28.76 MB** (크레이지게임즈 한도 250 MB 대비 매우 쾌적)
* **압축 해제 총 용량:** **45.27 MB** (크레이지게임즈 권장 첫 다운로드 **< 50 MB 규정 완벽 통과**)
* **파일 개수:** 68개 (한도 1,500개 대비 매우 경량)
* **SDK:** CrazyGames SDK v3 연동 및 `gameplayStart` / `gameplayStop` 수명주기 이벤트 탑재

---

## 2. 제출 페이지 접속
1. 크롬 브라우저에서 [CrazyGames Developer Portal](https://developer.crazygames.com/) 에 접속합니다.
2. 개발자 계정으로 로그인 (구글 계정으로 3초 만에 로그인 가능).
3. 대시보드에서 **[Submit Game]** 또는 **[Add Game]** 버튼을 클릭합니다.

---

## 3. 제출 양식 입력 내용 (복사해서 바로 사용)

### ① Game Title (게임 제목)
```text
Shadow Pulse
```

### ② Game Files (ZIP 업로드)
* **Type:** HTML5 (.zip) 선택
* **Upload:** `Finder`에서 `/Users/choeminseong/Desktop/게임/artifacts/crazygames/shadow-pulse-crazygames.zip` 파일을 드래그 앤 드롭합니다.

### ③ Short Description (한 줄 요약 - 영어)
```text
Swing through a futuristic 3D city with high-speed physics, aerial combat combos, and parkour action right in your browser.
```

### ④ Detailed Description (상세 설명 - 영어)
```text
Shadow Pulse is a fast-paced 3D open-world superhero action game running smoothly in WebGL at 60–144 FPS without any downloads.

Take control of a web-slinging hero equipped with responsive pendulum swing physics, fluid wall acrobatics, and combo-heavy martial arts combat. Explore a procedural metropolis or the massive Hong Kong district, defeat enemies, and master high-speed aerial traversal.

Key Features:
• Physics-driven web-swinging and high-altitude momentum
• Fluid combat combo system with aerial finishers and ground slams
• Full keyboard + mouse and touch support
• Optimized 3D rendering with smooth 60–144 FPS support
```

### ⑤ Controls (조작법 - 영어)
```text
• WASD: Move / Run
• Space: Jump / Wall Climb
• Left Click / E: Shoot Web / Swing
• Shift: Sprint
• Left Click (Near Target): Attack Combo
• Right Click: Guard / Aim
• C: Cycle Camera Perspective
• Esc: Pause / Menu
```

### ⑥ Tags & Category (태그 및 카테고리)
* **Category:** Action / 3D
* **Tags:** `Action`, `3D`, `Superhero`, `Parkour`, `WebGL`, `Physics`, `Fighting`

### ⑦ Media Assets (이미지 첨부)
아래 경로에 필요한 모든 이미지가 준비되어 있습니다:
* **Cover Image (썸네일):** `/Users/choeminseong/Desktop/게임/artifacts/crazygames/media/cover.png`
* **Banner (가로형 배너):** `/Users/choeminseong/Desktop/게임/artifacts/crazygames/media/banner.png`
* **Screenshots (스크린샷):**
  1. `/Users/choeminseong/Desktop/게임/artifacts/crazygames/media/01-hong-kong-gameplay.png`
  2. `/Users/choeminseong/Desktop/게임/artifacts/crazygames/media/02-local-city-gameplay.png`
  3. `/Users/choeminseong/Desktop/게임/artifacts/crazygames/media/03-world-map.png`

---

## 4. 심사 진행 절차
1. 위 항목들을 입력하고 **[Submit for Review]**를 누르면 끝입니다.
2. 크레이지게임즈 운영팀(QA)이 1~3영업일 내에 플레이 테스트를 진행합니다.
3. 승인(Basic Launch)되면 즉시 크레이지게임즈 메인 페이지의 'New Games' 섹션에 등록되어 전 세계 유저들의 플레이가 시작됩니다!
