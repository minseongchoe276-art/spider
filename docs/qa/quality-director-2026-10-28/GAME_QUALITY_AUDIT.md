# SHADOW PULSE 품질 감사

날짜: 2026-10-28  
기기: MacBook Pro 17,1 · Apple M1 · 16GB  
실행: `http://127.0.0.1:5191` · Vite 7.3.7 · headed Google Chrome  
지도: `?city=procedural` (네온 도심). 홍콩 스트리밍 도시는 이번 실행에서 열지 않았다.

점수는 이번 세션에서 측정한 범위만 말한다. 듣지 못한 소리, 돌지 않은 8인 방, 걷지 않은 도시 구역에는 점수를 주지 않는다.

## 확인한 스택

- 제품명 SHADOW PULSE. `package.json` 버전 1.0.0.
- Three.js 0.170.0. 렌더러는 `WebGLRenderer`.
- 물리 본체는 `src/SwingPhysics.js`의 직접 구현이다. `@dimforge/rapier3d-compat` 0.21.0은 의존성에 있고, 홍콩 충돌은 `StreamedCollision`이 Rapier를 쓴다. 이번 절차 도시 스윙 판정은 `buildingMeshes` 레이캐스트였다.
- 입력은 `window`의 `keydown` / `mousedown`이다. `GamepadInput`도 같은 이벤트를 만든다.
- 개발 서버의 방은 같은 출처 `/ws`다. 프로덕션 소켓 주소는 `.env.production`에만 있고, 그 서버에는 접속하지 않았다.
- 모션 카탈로그와 `public/motions` JSON은 37개다. 지시문의 57개와 맞지 않다.

## Git

- 브랜치 `main`, `d8bbc3a`, `origin/main`과 같다.
- 차량·시민 관련 미커밋 변경 29경로는 그대로 두었다. 커밋하지 않았고 브랜치도 옮기지 않았다.
- 이번 추가분은 개발 전용 프로브, 러너, 이 보고서다. `src/main.js`에는 `?qualityDirector=1`일 때만 동적 import가 붙는다. `import.meta.env.DEV`이고 호스트가 `127.0.0.1` 또는 `localhost`일 때만 붙는다.

## 자동 플레이가 실제로 한 일

가능했다. Chrome을 띄워 솔로 진입, 키보드 이동, 점프, 전투 클릭, 스윙 클릭, 모션 리뷰 화면, 로컬 2인 방을 실행했다.

Pointer Lock은 실패했다. `canvas.requestPointerLock()`이 `WrongDocumentError: The root document of this element is not valid for pointer lock`을 냈다. 이 항목은 통과가 아니다.

대신 확인한 입력:

- Playwright `keyboard`의 W, Shift, Space, Q, E, G, PageUp, PageDown, End. PageUp/End는 `ThirdPersonCamera.handleMouseMove`로 이어지고, 피치와 요가 실제로 바뀌었다.
- Playwright `mouse`의 좌클릭·우클릭은 `#webgl-canvas`에 떨어졌다. 잽, 스트레이트, 스윙 발사가 게임 핸들러로 들어갔다.
- 성공한 스윙의 조준은 포인터 락 마우스가 아니다. 프로브가 요·피치를 쓰고, 다음 프레임의 카메라 광선이 `findBestAnchor`에 걸릴 때까지 고른 뒤, 실제 마우스 다운으로 발사했다.

## 점수

| 항목 | 점수 | 근거 | 점수에서 뺀 것 |
| --- | --- | --- | --- |
| Animation Quality | 없음 | 기술 37/37 통과. 정지 화면 8장은 아래 애니메이션 보고서 | 클립 전체의 시각 통과를 한 점수로 합치지 않음 |
| Combat Quality | 68 | 잽·스트레이트·훅(heavy)·어퍼컷(special)·잽→스트레이트·이동 잽·연타가 상태 키로 기록됨 | 맞는 상대, 피격, 타격음, 주먹 궤적의 연속 촬영 |
| Movement Quality | 74 | 걷기 최대 7.0m/s, 질주 11.2m/s, 정지 후 IDLE, 점프 후 JUMPING·FALLING | 벽 타기, 파쿠르 연결, 도시 전역 |
| Web Swing Quality | 64 | 하늘 조준은 부착 실패가 맞고, 피치 -0.9에서 부착·SWINGING 44프레임·최대 29.1m/s | 양손, 연속 스윙, 골목, 건물 충돌 |
| Physics Consistency | 없음 | 추락 후 y=0.1 착지, 옥상 y=95.47 유지. 샘플이 좁다 | 관통·튕김의 체계 측정 |
| Camera Quality | 52 | 키보드 시선은 동작. 위를 오래 보면 몸이 화면에서 작아지고 일시정지가 열림 | Pointer Lock 조작감 |
| Graphics Quality | 없음 | 절차 도시의 스폰과 옥상 몇 블록만 봤다 | 도시 전역, 홍콩, 야간 조명 |
| VFX Quality | 없음 | 착지 충격파 호출 2회, 거미줄은 흰 선이 보임 | 이펙트 품질을 프레임으로 판정하지 않음 |
| Audio Quality | 없음 | 호출만 집계. 소리를 듣지 않음 | 음량, 타이밍, 음색 |
| UI/UX Quality | 61 | 레슨, 일시정지, 모드 전환, 실패 문구가 보였다. 차량 바가 화면 아래를 가린다 | 첫 사용자 인터뷰 |
| Multiplayer Quality | 없음 | 로컬 2인은 위치 오차 약 1cm, 화면의 지연 27ms | 1·4·8인, 공격 동기, 재접속 |
| Performance | 66 | 절차 도시에서 평균 약 60fps. 점프 구간의 1% 저하는 10fps | 홍콩, 장시간, 8인 |
| Stability | 70 | 솔로 세션 콘솔 오류 0. 블러는 일시정지, 리사이즈 후 플레이 유지 | 소크, 탭 폐기, 새로고침 루프 |
| Accessibility | 없음 | 키보드 시선과 레슨 문구만 확인 | 스크린 리더, 색약, 리매핑 실사용 |
| Gameplay Design | 없음 | 의견은 백로그의 DESIGN_PROPOSAL | 플레이 테스트 인원 없음 |

자동 점수는 이번 기록의 보조 지표다. 사용자 평가를 대신하지 않는다.

## 한 줄

코드가 죽은 상태는 아니다. 솔로 이동과 전투 입력, 조준이 맞은 스윙, 로컬 2인 동기까지 이 기계에서 돌아갔다. 완성도로 보면 스폰 주변은 아직 테스트 블록에 가깝고, 양손 스윙·도시 전역·8인·소리·포인터 락은 이번 실행으로 통과라고 말할 수 없다.
