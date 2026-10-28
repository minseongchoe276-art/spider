# SHADOW PULSE V3 진단과 수정 계획

2026-10-28. 절차 도시, 로컬 Vite `127.0.0.1:5191`. 진단 뒤 승인된 세 가지를 적용했다. 피해, 히트 창, 스태미나, 웹 물리, 모션 JSON은 그대로다.

상태 뜻: PASS, FAIL, FIXED_AND_VERIFIED, UNVERIFIED, BLOCKED. 화면을 직접 보지 않은 프레임은 VISUAL_UNVERIFIED.

## 이번에 고친 것

플레이어가 보는 동작은 바꾸지 않았다. 개발 프로브만 넓혔다.

- `src/QualityDirector.js`: `peers()`가 원격 `activeAction` 옆에 `combatAction`과 `networkAnimation`을 반환한다. `dt >= 0.05`를 `spikes()`에 남긴다. `diagnostics()`는 셰이더 프로그램 수, 드로우콜, 힙을 반환한다.
- 측정 스크립트: `scripts/quality-director/v3-frames.mjs`, `v3-combat-pose.mjs`, `v3-play.mjs`, `v3-swing-settle.mjs`, `v3-remote.mjs`.

## 승인 후 적용

### 훅 — FIXED_AND_VERIFIED

원본 `Boxing Hook`은 그대로다. E는 계속 `heavy`(1.05초, 타격 0.52–0.70, 피해 32, 기력 18)다. `CharacterPose.js`가 그 재생 위에 리드 훅을 얹는다. 가슴은 로딩에서 반대로 돌았다가 타격에서 따라오고, 왼주먹은 중앙선을 넘으며 팔꿈치는 굽는다. 오른주먹은 턱 가드에 남긴다. 잽과 스트레이트 경로는 건드리지 않았다.

24/60/144fps, 제자리와 이동, 30케이스 `scripts/check-strike-steering.mjs` PASS. 제자리 heavy 타격 중간: 팔꿈치 1.49rad, 어깨 횡 -0.20m, 주먹 횡 +0.07m, 전방 0.44m. 스트레이트 측면 `shots/v3-fix2-cross-side-50.png`는 팔이 끝까지 나간다. 헤비 사선 `shots/v3-fix2-heavy-three-50.png`는 굽힌 리드 훅이다. 실기 화면은 공격 시간 0.517초에 찍었다. `shots/v3-fix2-heavy-live.png`.

### 카메라 — FIXED_AND_VERIFIED

`Combat.js`는 공격 시작 때 한 번만 몸을 맞춘다. 이후 마우스 요는 몸을 돌리지 않는다. `Camera.js`의 `presentationYaw`는 땅 위 잽·스트레이트·heavy 중에만 붐을 0.72rad 오른쪽으로 옮기고, `movementYaw`에는 쓰지 않는다. 스윙 중에는 0으로 둔다. 특수기 대시는 이 경로가 아니다.

실측: 잽이 시작된 뒤 요 +1.2, facing 변화 0, 붐과 조준 차 0.456(당시 오프셋 0.52가 0.28초 감쇠 중). `shots/v3-fix-camera-jab.png`에서 주먹이 보인다. `scripts/check-strike-view.mjs`는 조준 요가 그대로이고 스윙 붐이 가운데로 돌아가는 것을 확인했다.

### 차량 바 — FIXED_AND_VERIFIED

`player-ui.css`에서 데스크톱 바를 오른쪽, 미니맵 위로 옮겼다. 1440×900: 바 left 1040 right 1416 top 602 bottom 666. 미니맵과 간격 26px. 기술 바 top 814과 겹치지 않는다. 화면 중심(720)을 비운다. 운전 중에는 하단 24px 가운데로 돌아간다. `shots/v3-fix2-vehicle-ui.png`. 차량 조작 코드는 바꾸지 않았다.

## QD-03 훅과 헤비

상태: FIXED_AND_VERIFIED. 원본 클립은 그대로이고, 재생 자세를 고쳤다. 아래는 고치기 전 원인이다.

### 원인

`public/motions/hook.json`과 `heavy.json`의 트랙 66개는 값이 같다. 파일 크기는 284213과 284214바이트이고, 차이는 클립 이름 `hook` / `heavy` 한 글자다. 둘 다 `src/MotionCatalog.js` 36–37행에서 `Boxing Hook`, `trim [0, 1.4]`, `impactPhase .43`, `authoredMixamo: true`다. 원본은 `public/models/Boxing Hook.fbx`.

모션 리뷰는 클립 퍼센트를 그대로 찍는다 (`src/MotionReview.js` 129–136행). 그래서 10, 25, 50, 75, 90% 다섯 장 모두 픽셀이 같다. 50% SHA-1은 `5084f34cfede56eb40302dddc0f37ef713517f74`. V2의 45% SHA-1 `6d5a3829750aa2754b3988cff9da95b89c6cbd12`와 같은 현상이다.

플레이어 입력은 `hook` 키를 재생하지 않는다. E는 `main.js` 473–475행에서 `combat.heavy()`를 호출하고, `Combat.js` 72–76행이 `heavy`를 시작한다. 전투 리뷰의 “강한 훅” 버튼도 `combat.heavy()`다 (`src/CombatReview.js` 42행).

실제 게임의 heavy는 그 클립을 그대로 돌리지 않는다. `Character.js` 753행이 `heavyClipPhase()`로 재생 시각을 늦추고, `CharacterPose.js` 979–988행이 준비 동작에서 가슴을 세운 뒤 같은 타격으로 민다. 전투 리뷰의 측면 화면은 다섯 구간 모두 hook과 heavy가 달랐다. 25% heavy는 주먹을 얼굴 옆에 모은 준비, 50%는 한 팔을 앞으로 뻗고, 75%는 다시 가드 근처다. hook 원본 50%는 가드에서 앞으로 뻗는 스트레이트다.

`rightHook`은 다른 클립이다. `MotionCatalog.js` 47행, 소스 `Boxing Stance.fbx`, `authoredMixamo`가 없어 `MotionRetarget.js` 81행의 `choreographCombat`이 돈다. 길이는 0.68초, 트랙 66개는 hook과 전부 다르다. 측면 25/50/75%는 팔꿈치를 굽히고 몸통을 튼다. 어떤 버튼도 이 키를 시작하지 않는다. 리뷰 라벨은 “이전 오른손 훅”이다.

`CombatChoreography.js`의 hook 스핀과 heavy 직권은 `authoredMixamo` 때문에 이 두 키에 적용되지 않는다. 그 분기를 켜면 카탈로그가 적은 “spinning roundhouse”가 재생된다. 복싱 훅이 아니다.

훅으로 읽히려면 골반 회전, 몸통 회전, 밖으로 굽은 팔꿈치, 정면이 아니라 중앙선을 가로지르는 주먹 궤적이 필요하다. 본 `Boxing Hook` 50%는 앞으로 뻗는다. 그 조건을 충족하지 않는다.

### 재현

`/?motionReview=1`에서 hook과 heavy를 같은 퍼센트에 둔다. 라이브 차이는 `/?combatReview=1`, 측면, 행동 시간 0.25와 0.50.

### 수정 계획

승인 전에는 적용하지 않는다.

1. 파일 이름만 바꾸지 않는다. E의 기력 18, 길이 1.05초, 타격 창 0.52–0.70을 유지한다.
2. `rightHook`으로 바로 갈아끼우지 않는다. 길이가 0.68초라 지금의 타격 창을 비껴 가고, 정면 궤적이 아직 확인되지 않았다. 정면 10/50/90%를 본 뒤에만 후보로 남긴다.
3. 정면에서도 주먹이 앞으로 나가면 새 훅 테이크가 필요하다. 기존 FBX를 고치지 않고 새 클립을 카탈로그에 추가하는 쪽이 원본 보존과 맞다.
4. `authoredMixamo`를 꺼서 스핀 라운드하우스를 켜지 않는다.

### 부작용

클립을 바꾸면 E의 타격 시각과 방패 관통(`Combat.js` 179행, hook/heavy/special)의 보이는 타이밍이 어긋날 수 있다. 수치를 그대로 두고 그림만 바꾸려면 타격 창을 새 클립의 접촉 구간에 다시 맞춰야 한다. 그 맞춤도 승인 항목이다.

### 검증

원본 화면 일치는 다섯 퍼센트 해시로 확인했다. 라이브 heavy가 원본과 다른 것은 측면 다섯 장으로 확인했다. 정면 궤적과 실제 E 입력의 주먹 경로는 VISUAL_UNVERIFIED. 게임 안에서는 후면 카메라가 팔을 가린다. QD-02.

### 남은 위험

플레이어가 보는 E는 여전히 앞으로 뻗는 테이크다. 이름만 훅이다.

## QD-02 전투 카메라

상태: FIXED_AND_VERIFIED. 아래는 고치기 전 원인이다.

### 원인

공격 방향과 카메라 요를 매 프레임 같게 만든다.

- `Combat.js` 42–47행 `face()`가 `camera.userData.movementYaw`를 `facingAngle`과 `targetFacingAngle`에 쓴다.
- 같은 파일 134행이 special이 아닌 공격 동안 매 프레임 `face()`를 다시 호출한다. 49행은 시작 시점의 한 번이다.
- `SwingPhysics.js` 970–979행은 전투 자세에서 이동할 때 몸통을 카메라 조준으로 고정한다. 가드가 아니어도 이동 중이면 이 분기를 탄다. 공격 중이고 가드가 아니면 979행은 건너뛰고, 134행이 대신 돌린다.
- `Camera.js` 105–115행은 마우스가 돌면 `lockBehind`를 끈다. 204행은 `lockBehind`일 때만 카메라 요를 몸 방향으로 당긴다. 기본 붐은 232행에서 보는 방향의 반대, 즉 등 뒤다.

측정: 전투 중 요를 +1.2라디안 옮기고 잽을 눌렀다. 280ms 뒤 `facing` 1.2, 카메라 요 1.2, 둘의 차 0. `facing`은 −0.0105에서 1.21라디안 돌았다. `shots/v3-camera-jab.png`는 그 뒤에 찍혔고 캐릭터의 등이 카메라를 본다. 주먹은 화면 앞으로 나오지 않는다.

웹 스윙 카메라는 이 경로를 타지 않는다. 와이어 모드에서는 `combatStance`가 꺼져 979행의 조준 고정이 없고, 스윙 중 붐은 `Camera.update`의 속도 거리만 늘린다.

### 재현

절차 도시 솔로, Q로 전투, 공격을 누른 채 시선을 옆으로 옮긴다. 몸이 시선을 따라 돈다.

### 수정 계획

가장 좁은 안. 승인 전 적용하지 않는다.

1. 공격이 시작된 뒤 134행의 반복 `face()`를 멈춘다. 49행의 시작 방향은 유지한다. 공격 도중 시선을 돌려도 주먹 방향은 버튼을 누른 순간의 조준으로 남는다.
2. 땅에 붙은 잽, 스트레이트, heavy가 재생되는 동안만 붐에 약 0.5라디안의 어깨 옆 오프셋을 더한다. 이 오프셋은 `movementYaw`와 `facingAngle`에 쓰지 않는다. 렌더 위치만 비킨다.
3. `isSwinging`, 와이어 모드, special의 돌진에는 1과 2를 적용하지 않는다. `Camera.js`의 스윙 거리와 요 추종은 그대로 둔다.

비교한 안: 전투 내내 어깨 오프셋을 고정하면 대기 자세의 시선까지 바뀐다. 카메라 요와 공격 방향을 분리하지 않고 오프셋만 주면, 134행이 몸을 다시 돌려 오프셋이 상쇄된다. 그래서 1과 2를 같이 두는 쪽이 범위가 작다.

### 부작용

이동 중 펀치의 방향이 시선 추적을 멈추므로, 공격 도중 조준을 고쳐 때리는 감각은 사라진다. 버튼을 누른 순간의 방향이 남는다. 붐 오프셋은 건물 가까이에서 `findCameraBoom`의 벽 회피와 겹칠 수 있다. 스윙 카메라에는 조건으로 막는다.

### 검증

방향이 카메라에 붙는 것은 수치와 후면 스크린샷으로 확인했다. 오프셋을 넣었을 때의 가시성은 아직 없다. 적용하지 않았기 때문이다.

### 남은 위험

기본 등 뒤 카메라에서는 주먹이 몸통에 가려진다. Run+Jab, Run+Cross, Run+heavy의 팔 연출은 텔레메트리만 있고 화면은 VISUAL_UNVERIFIED.

## QD-04 양손 웹

상태: PASS. 같은 앵커는 조준 설계다. 물리값은 바꾸지 않음.

### 원인

두 손은 각각의 로프를 가진다. `SwingPhysics.js` 218–220행이 그 손의 앵커만 갈아끼운다. `handForButton` 178–184행은 버튼을 손으로 나누고, 532행과 542행은 왼 버튼과 오른 버튼을 같은 프레임에서 순서대로 쏜다.

조준은 하나다. `main.js` 518–523행과 532–536행이 `setWebAimPoint(..., true)`로 포인터 잠금과 관계없이 화면 중심을 쓴다. `SwingPhysics.js` 109–111행은 그때 NDC를 0, 0으로 둔다. `findBestAnchor`는 그 레이 하나를 쓴다. 몸이 그 사이에 움직이지 않으면 두 손이 같은 점을 집는다.

지붕에서 아래를 보면 가까운 구조물이 먼저 맞는다. 피치 0.05로 카메라가 안착하기 전에 잰 레이는 플레이어 기준 약 15m 앞(`z` 105)이었고, 안착 후 클릭은 물탱크에 붙었다. 첫 시도의 두 앵커는 `[99.53, 103.58, 96.19]`와 `[99.49, 104.25, 96.16]`로 0.67m 달랐다. 첫 발이 몸을 움직인 뒤 둘째 레이가 나갔기 때문이다. 이후 다섯 번은 같은 점, 길이 1.6–2.9m, 속도 0.06–0.4m/s였다. HUD는 양손 스윙. 이것은 도시 호가 아니라 물탱크에 붙은 짧은 매달림이다.

위를 보고 카메라를 280ms 이상 둔 뒤에는 달랐다. 피치 −0.45, 요 3.927에서 앵커 `[46, 113.34, 36.42]`, 플레이어와의 거리 77.87m. 다시 확인해도 77.87m. 두 손 모두 그 점, 로프 길이 63.115m, 속도 14.2m/s. 화면의 HUD는 양손 스윙, 52km/h. `shots/v3-settled-dual.png`. 줄은 하나로 보인다. 앵커가 같아서 두 줄이 겹친다. 손에서 나오는지는 이 거리의 후면 화면으로 나누어 보지 못했다. VISUAL_UNVERIFIED.

놓은 뒤 1.4초 구간의 상태는 SWINGING, FALLING이고 모션 집합은 jump, swing, drop, fall이다. 착지 클립은 그 창 안에 없었다. 이동 44m, 최고 48m/s.

### 재현

솔로 절차 도시. 피치를 음수로 두고 시야를 건물 위로 280ms 이상 고정한 뒤 좌우 버튼을 같이 누른다. 지붕에서 아래를 보면 V2의 3.4m와 같은 종류의 짧은 부착이 난다.

### 수정

필요 없다. 같은 점은 버그가 아니다. 손을 일부러 벌리면 한 조준이라는 조작이 바뀐다. 물리값을 건드리지 않는다.

줄을 두 가닥으로 보이게 하려면 앵커를 나누는 대신 손목 출발점만 벌리는 그림 수정이 가능하다. 그건 별도 승인이고, 이번 화면만으로 손목 연결이 깨졌다고 보지 않는다.

### 남은 위험

시작 지붕의 기본 시선은 물탱크다. 플레이어가 위를 보지 않으면 긴 스윙이 나오지 않는다. 착지까지 이어서 본 기록은 없다.

## QD-06 100ms 프레임

상태: UNVERIFIED. 지속 저하로 보지 않음. 최적화 패치 없음.

### 측정

같은 양손 부착을 여섯 번 했다.

| 회 | 웹 | 속도 | maxDt | 평균 fps | 프로그램 수 |
| --- | --- | --- | --- | --- | --- |
| 0 | 2 | 0.402m/s | 0.1000s | 60.18 | 10 → 12 |
| 1 | 2 | 0.098 | 0.0178 | 60.05 | 12 |
| 2 | 2 | 0.061 | 0.0177 | 60.03 | 13 |
| 3–5 | 2 | 0.061 | 0.0178–0.0180 | 약 60 | 13 |

`spikes()`에는 세 건이 있다. 시작 1.46초에 IDLE, 웹 0, 프로그램 9, dt 0.100초. 그다음 0.060초. 첫 양손 스윙에서 SWINGING, 웹 2, 프로그램 12, dt 0.100초. 긴 도시 스윙 창에서는 maxDt 0.083초가 한 번 있었고 반복 측정은 하지 않았다.

첫 웹에서만 프로그램이 2개 늘고 힙이 31MB에서 45MB로 올라갔다. 이후 회차에서는 프레임이 18ms 안에 머물렀다. 셰이더 컴파일이 유력하지만 GPU 프로파일로 확정하지는 않았다. 충돌, 레이캐스트, 애니메이션, 네트워크의 함수별 시간은 재지 않았다. 병목이 한 함수로 확정되기 전에는 패치를 넣지 않는다.

### 남은 위험

콜드 스타트의 첫 웹과 세션 초반 IDLE에 한 프레임 스파이크가 다시 날 수 있다. 스윙이 계속되는 동안의 프레임 저하는 이번 여섯 번에 없었다.

## QD-07 원격 전투 모션

상태: PASS. 서 있는 잽 한 종류. 화면의 주먹 형태는 VISUAL_UNVERIFIED.

### 원인으로 보지 않는 것

V2는 잽이 끝날 무렵 한 장에서 원격 `activeAction`이 `combatIdle`이었다. 그 시점은 동작이 끝난 뒤와 겹친다.

로컬 방 `998525`, 2인, 개발 `/ws`. 클릭 전부터 끝난 뒤까지 80ms 간격으로 25샘플.

- 43ms: 로컬 `combatIdle`, 원격 모션 `combatIdle`, combat `combatIdle`, network `combatIdle`.
- 152ms: 로컬 클립 `jab` 0.162초, 공격 시간 0.087 / 0.72. 원격 모션 `jab`, combat 0.074, network `jab` 0.136.
- 252–768ms: 양쪽 모두 `jab`. 768ms에 로컬 공격 시간 0.698, 원격 combat 0.708, network 클립 시간 1.312.
- 868ms: 양쪽 `combatIdle`.

전송은 `Multiplayer.js` 492–494행의 이동 패킷이 100ms마다 `capturePose`를 싣는다. 타격 패킷은 480–483행에서 히트 창(`jab`은 0.14초)에 나간다. 그림은 타격 패킷 전에도 이동 포즈로 간다. `RemoteMotion.js` 157행이 `combatAction`을 넣고, `Character.js` 700행이 네트워크 클립 이름을 우선한다. 서 있는 잽은 그 이름이 `jab`이다. 프로브가 예전에는 `activeAction`만 봐서, 끝난 뒤의 `combatIdle`을 재생 실패로 읽을 수 있었다.

게스트 스크린샷은 회복 뒤다. DirectorA가 14m 앞에 서 있다. 주먹이 나간 프레임은 보지 못했다.

### 남은 위험

달리는 잽, 히트 리액션, 웹, 4인 동시 공격은 이번 타임라인에 없다. 100ms보다 짧은 동작은 샘플 사이에 빠질 수 있다. 이번 0.72초 잽은 빠지지 않았다.

## QD-05 차량 바

상태: FIXED_AND_VERIFIED. 바 위치만 옮겼다. 아래는 고치기 전 원인이다.

### 원인

`src/VehicleSystem.js` 12–18행 `createUI()`가 `#vehicle-ui`를 만들어 `document.body`에 붙인다. 문구는 선택 차량 이름과 `BMW 330i 불러오기 · B`다. 위치는 `src/player-ui.css` 511행, `left: 50%`, `bottom: 110px`, 최대 너비 650px. 게임 HUD의 `#ability-bar`는 `index.html`의 기술 바이고 이 파일의 소유가 아니다.

1440×900에서 측정했다. 차량 바는 top 726, bottom 790, left 532, right 908, 376×64. 기술 바는 top 814, bottom 878. 간격 24px. 사각형은 겹치지 않는다. 바는 3D 화면의 아래 중앙을 덮는다. 지붕 샷에서는 캐릭터 다리 앞, 스윙 샷에서는 건물 중앙이다. `shots/v3-vehicle-ui.png`, `shots/v3-settled-dual.png`.

### 수정 계획

승인 전 적용하지 않는다. `VehicleSystem.js`, `player-ui.css`, 차량 물리, 휠은 그대로 둔다.

방향: 데스크톱도 터치 규칙(`player-ui.css` 515행, 오른쪽 하단)처럼 가장자리로 옮기거나, B가 의미 있을 때만 바를 연다. 기술 바와 HP, 미니맵의 사각형과 24px 이상 떨어지고, 캐릭터 중심 세로띠를 비운다. 운전 중 하단 24px 규칙은 유지한다.

### 부작용

가장자리로 옮기면 운전석 안내 문장이 미니맵과 만날 수 있다. 바를 숨기면 B 안내를 다른 HUD가 맡아야 한다. 둘 다 차량 조작 코드와 분리된 CSS 문제다.

### 남은 위험

현재 빌드에서는 아래 중앙을 계속 가린다.

## QD-01 Pointer Lock

상태: UNVERIFIED. 플레이어 버그로 분류하지 않음.

자동화 Chrome 156, `navigator.webdriver === true`에서 `canvas.requestPointerLock()`이 `WrongDocumentError: The root document of this element is not valid for pointer lock.`을 냈다. 잠금은 실패했다. `main.js`의 빈 `catch`가 이 예외를 삼킨다. 게임 로직이 다른 문서를 가리키는 것은 아니다. 캔버스는 같은 문서에 있다.

일반 Chrome은 이번에도 열지 않았다. 브라우저 보안을 우회하는 플래그나 가짜 제스처는 쓰지 않았다.

## 모션 37개

`/?motionReview=1`에서 37개 전부 10, 25, 50, 75, 90%를 저장했다. `shots/v3-motions/`, 185장. 해시가 구간마다 다른 클립은 36개다. `zip`만 다섯 장이 같다. `public/motions/zip.json`은 길이 1초, 키 2개, 두 키의 값이 64개 트랙 모두 같다. 정지 포즈다.

같은 화면 쌍은 hook/heavy 다섯 구간, fall/fallIdle 다섯 구간이다. fall과 fallIdle은 카탈로그에서 둘 다 `Falling Idle Neutral`이다.

직접 본 원본: run 10/50/90은 다리가 바뀌며 이어진다. swing 50은 쪼그린 채 한 팔을 든다. jab 50은 가드에 가깝다. 타격 위상 0.28을 지난 구간이다. hook 10은 가드, 50은 앞으로 뻗는 팔, 90은 가드. land 50은 상체가 숙여진다. wall 50은 무릎과 팔이 올라간다. special 50은 주먹이 위로 올라간다. zip 50은 두 팔을 든 채 공중에 있다.

직접 본 라이브 측면: `shots/v3-combat/`. hook, heavy, rightHook, cross. 내용은 QD-03.

나머지 프레임은 파일이 있으나 VISUAL_UNVERIFIED다. 해시가 다르다는 것은 정지 화면이 다섯 장 복사된 것이 아니라는 뜻이지, 무릎과 팔꿈치가 자연스럽다는 판정은 아니다.

### 조합

| 조합 | 텔레메트리 | 화면 |
| --- | --- | --- |
| Run + Jab | 공격 `jab`, 다리는 `regularRun`, 속도 4.4m/s, 이동 4.7m | VISUAL_UNVERIFIED |
| Run + Cross | 공격 `cross`, `regularRun`, 속도 3.7m/s | VISUAL_UNVERIFIED |
| Run + E | 공격 `heavy`. 창 초에 이전 `cross`가 남아 있었다. 다리는 `walk` | VISUAL_UNVERIFIED |
| Jump + Attack | 공중에서 새 잽이 시작되지 않았다. `canStrike`는 IDLE, RUNNING, SPRINTING, LANDING만 허용한다 | 해당 없음 |
| Swing + Landing | 63m 양손 후 FALLING. 모션 집합에 swing, drop, fall. 착지 클립은 창 밖 | 착지 VISUAL_UNVERIFIED |
| Attack + Attack | 제자리에서 `jab` 다음 `cross`. 몸 전체 클립 | VISUAL_UNVERIFIED |

## 우선순위

1. 전투 카메라의 시작 방향 고정과 공격 중에만 쓰는 붐 오프셋. 스윙 카메라는 제외.
2. E용 훅을 새로 만들 것인지, `rightHook` 정면을 먼저 볼 것인지 결정.
3. 차량 바를 가장자리로 옮기는 CSS. 차량 조작과 분리.
4. 프레임 패치와 웹 물리, 포인터 락 우회는 하지 않는다.
