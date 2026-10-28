# 수정과 재검증

게임 물리, 전투 수치, 모션 클립, 도시, 운영 서버는 바꾸지 않았다. 상위 3개를 고치라는 한도는 “위험이 낮은 결함”이다. 재현된 스윙 실패는 하늘 조준의 정상 거절이었고, 차량 바는 미커밋 작업 중이며, 점프 속도 26은 물리 값이라 승인 없이 내리지 않았다.

## 넣은 것

1. `src/QualityDirector.js`  
   개발 전용 계측. 위치, 속도, 가속도(직전 속도와의 차), 상태, 클립, 블렌드 가중치, 카메라 요·피치, 웹 길이, 슬랙, fps, 힙, 드로우콜.  
   `swingTension`은 시뮬레이션에 없는 값이라 null이다.  
   오디오·VFX 호출 횟수를 센다. 운영 호스트에서는 `attachQualityDirector`가 즉시 return한다.

2. `src/main.js`  
   `import.meta.env.DEV`이고 루프백이며 `qualityDirector` 쿼리가 있을 때만 동적 import. 플레이 중 카메라 갱신 뒤에 `sample`을 호출한다.

3. `scripts/quality-director/`  
   `play.mjs`, `audit-motions.mjs`, `aim-sweep.mjs`, `multi-retest.mjs`, `swing-retest.mjs`.  
   `package.json`에 `qa:director`, `qa:motions`.

4. 프로브 패널 위치  
   처음에는 왼쪽 아래라 HP를 가렸다 (`01-idle` 설명). 오른쪽 위로 옮긴 뒤 `10-settled-swing.png`에서 HP와 레슨 카드는 가리지 않았다. 그 컷에서는 창 버튼 옆에 붙어 있었다. 그 다음 `top: 46px; right: 8px`로 한 번 더 내렸고, 그 좌표는 다시 찍지 않았다. 마지막 위치는 UNVERIFIED.

5. `seekWebTarget`  
   한 번의 카메라 보간 중 레이캐스트가 건물을 집어서, 정착한 화면에서는 하늘인 피치 -0.45를 성공으로 보고했다. 정착 뒤 `findBestAnchor`가 앵커를 줄 때만 `ok`가 되도록 바꿨다. 이 함수를 고친 뒤 다시 실행하지는 않았다. 검증된 조준 절차는 `aim-sweep.mjs`다.

## 재검증된 게임 동작

- 피치 -0.9, 실제 마우스 다운: SWINGING, 웹 1, 최대 29.1m/s, 화면의 34km/h. `aim-sweep.json`, `10-settled-swing.png`.
- 로컬 2인: 게스트 좌표가 호스트와 약 1cm. `multi-retest.json`, `mp-guest.png`.
- 전투 입력 7종과 이동 3종: `play.json` PASS. 코드 수정 전의 결과다. 전투 코드를 건드리지 않았으므로 회귀로 다시 돌리지는 않았다.

## 되돌리기

커밋하지 않았다. 프로브와 보고서를 지우고 `src/main.js`의 qualityDirector 블록과 `sample` 호출, `package.json`의 스크립트 두 줄을 빼면 게임 동작은 이번 작업 전과 같다.
