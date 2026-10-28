# 자율 테스트 기록

실행 시각은 `play.json`, `aim-sweep.json`, `multi-retest.json`, `motion-technical.json`에 있다.

## 환경

- 5173 포트는 `SoldierThirdPersonThreeJS`의 Vite가 이미 쓰고 있었다. SHADOW PULSE는 `127.0.0.1:5191`에 새로 띄웠다.
- Playwright 모듈은 Codex 캐시에 있었다. 브라우저 채널은 설치된 Google Chrome, `headless: false`다. WebGL은 이 창으로 그렸다.
- 진입 URL: `/?city=procedural&play=solo&qualityDirector=1`.
- 프로브 `window.__shadowPulseQuality`는 개발 서버의 루프백에서만 붙는다. 운영 번들에 넣지 않았다. 운영 빌드에 문자열이 없는지는 이번 세션에서 `vite build`로 확인하지 않았다.

## 솔로 시나리오 (`play.json`)

통과 22, 실패 2, 미검증 1, 차단 1.

통과: 부팅, 키보드 시선, 걷기, 질주가 걷기보다 빠름, 질주 정지, 점프, 전투 모드, 잽, 스트레이트, E 훅(`heavy`), G 어퍼컷(`special`), 잽 다음 스트레이트, 이동 잽, 연타, 와이어 모드 복귀, 블러 시 일시정지, 리사이즈, 대기 fps 샘플, 오디오 함수 호출, VFX 함수 호출, 콘솔 오류 없음, 모션 리뷰 프레임 저장.

실패로 기록된 두 건은 웹 스윙과 양손 스윙이다. 원인은 아래 웹 스윙 보고서. 게임 결함으로 확정하지 않는다.

미검증: Pointer Lock.

차단: 그 실행의 멀티플레이는 `#player-name`이 화면에 보이지 않아 Playwright `fill`이 끝나기 전에 페이지가 닫혔다. 이후 `multi-retest.mjs`가 DOM 클릭으로 다시 열어 2인을 통과시켰다.

## 측정된 이동

걷기 2.09초, 이동 8.99m, 최대 7.00m/s, 상태 RUNNING→IDLE, 클립 walk→regularRun→stop→idle. 평균 61.4fps.

질주 최대 11.17m/s, 클립 run→runStop. 걷기보다 빠르다.

점프 1.51초, 시작 y 95.47, 끝 y 107.40, 최대 속력 26.47m/s. `SwingPhysics.jumpForce`는 26이다. 상태 JUMPING, FALLING. 클립 jump, drop.

점프 직후 화면은 일시정지 메뉴였다. Pointer Lock이 풀리면 `setPaused(true)`가 되는 기존 동작과 맞다. 자동화는 그 뒤 `#btn-start-drag`로 마우스 잠금 없이 이어 갔다.

## 하지 않은 것

- 홍콩 타일 도시.
- 도시 구역 순회. 본 곳은 스폰 옥상, 그 아래 착지, 게스트 화면의 블록 몇 개다.
- 벽 타기, 난간, 연속 스윙, 스윙 중 공격.
- 1인만 있는 방, 4인, 8인.
- 네트워크 끊김, 새로고침, 잘못된 URL의 홍콩 폴백을 끝까지 로딩.
- 소리의 청취.
- 운영 서버 `minogame.site`와 Render 방 서버.

## 상태 표기

PASS, FAIL, UNVERIFIED, BLOCKED를 JSON에 남겼다. 하늘 조준 스윙의 FAIL은 재시험 뒤 “조준 실패가 맞게 거절됨”으로 해석한다. 양손 스윙은 재시험하지 않아 제품 통과가 아니다.
