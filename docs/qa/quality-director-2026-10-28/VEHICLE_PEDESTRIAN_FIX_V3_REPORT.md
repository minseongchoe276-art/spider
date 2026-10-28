# 차량·보행 수정 V3 — 2026-10-28

로컬 Chrome, `http://127.0.0.1:5191`. 커밋, 푸시, 배포, 운영 서버는 하지 않았다. 가속도 5.8, 최고속도 24, 타이어 반지름, 스핀 식, 서스펜션, 웹스윙, 전투 피해, 인원 상한, 도시 지형, 캐릭터 모델은 바꾸지 않았다.

상태 단어는 PASS, FAIL, FIXED_AND_VERIFIED, UNVERIFIED, BLOCKED, NOT_APPLICABLE 만 쓴다.

플레이 중 시민은 `Math.random`이다. 단위 검사의 그래프는 시드 7281이다. 운전석 진입 거리는 그대로 2.3m, 높이 차는 1.2m다.

## 한눈에

| 항목 | 상태 | 이번 실행에서 본 것 |
| --- | --- | --- |
| 로컬 5개 도시 시민 | FIXED_AND_VERIFIED | 절차 8, 항구 6, 정원 6, 구시가 5, 스카이라인 5. 인도 위, 2초 동안 약 2.9–3.4m, 클립 walk |
| 홍콩 시민 이동 | FIXED_AND_VERIFIED | 8초 동안 4.47m, 5.46m. 앵커 1.25m. 예전 8초 정지(이동 0)는 재현되지 않음 |
| 홍콩 시민 화면 | UNVERIFIED | 프로브는 WALK 1.2m/s. 저장 프레임은 벽·난간에 가려 시민이 안 보임 |
| 옥상 차량 소환 | FIXED_AND_VERIFIED | 플레이어 y 122.47, 차 y 122.39, 같은 옥상, 전방 7m. 거리 y 0.02로 떨어지지 않음 |
| 지상 차량 소환 | FIXED_AND_VERIFIED | 절차 도시 차 y 0.02, 플레이어 y 0.2 |
| 설 자리 없음 | PASS | 공중 y 40은 “발밑의 바닥이 확인되지 않아…”. 홍콩 시작 난간 y 20.5는 “지금 서 있는 층에는…” |
| BMW 탑승 | FIXED_AND_VERIFIED | 운전석 앵커에 세우면 ENTERING 후 DRIVING. 트렁크 거리는 2.3m보다 큼. 앵커는 그대로 |
| 코르벳 탑승 | FIXED_AND_VERIFIED | 같은 규칙으로 ENTERING 후 DRIVING. 23km/h와 43km/h 화면 |
| 움직이는 바퀴 | FIXED_AND_VERIFIED | BMW·코르벳 각 5시점, 속도 6–14m/s. 스핀 증가분과 이동 거리가 맞음. 바퀴는 차체에 붙어 바닥에 있음 |
| 차·시민 회피 | NOT_APPLICABLE | 전용 회피 AI는 없다. 차체 안에 사람이 있으면 차가 서는 기존 판정만 단위 검사에서 확인 |
| 도시 전환 후 정리 | PASS | `?city=`는 문서를 새로 연다. 다음 도시의 인원이 이전 도시와 더해지지 않음 |
| 성능 | PASS | 시민이 있는 창의 평균은 약 60fps. 2.5초 주행 창의 1%는 프레임 하나(69ms)라 지속 저하로 보지 않음 |
| 원격 두 클라이언트 바퀴 | UNVERIFIED | 운영 서버와 부하 테스트는 하지 않음 |

## 실제 수정 파일

미커밋이다.

| 파일 | 한 일 |
| --- | --- |
| `src/main.js` | 홍콩만이 아니라 로컬 도시에도 같은 `AmbientCitizens`. 상한은 `AMBIENT_COUNTS` |
| `src/AmbientCitizens.js` | 인도 그래프가 있으면 그 위를 바닥으로 씀. 옥상 플레이어는 수평 22–70m에 거리 시민을 둠. 1.15초 동안 0.3m 미만이면 한 번 재탐색 |
| `src/QualityDirector.js` | 개발 전용 `place`, `look`, `summon`. `place`의 네 번째 값은 검사할 때만 바라보는 방향 |
| `package.json` | `test:vehicle-pedestrian` |
| `scripts/check-vehicle-pedestrian-v3.mjs` | TEST 01–15 단위 검사 |
| `scripts/quality-director/vehicle-pedestrian-v3.mjs` | 창이 있는 Chrome |
| `scripts/quality-director/vehicle-pedestrian-v3-aim.mjs` | 시민을 프레임 안에 두는 두 번째 Chrome |

`src/VehicleSystem.js`의 같은 층 주차는 작업 트리와 HEAD가 같다. 이번 턴에 그 파일은 다시 고치지 않았다. `ground()`와 `support()`는 그대로다. 주차 검색만 발밑 4m, 후보 아래 2.3m를 본다. 플레이어 Y를 차에 복사하지 않는다.

`src/VehicleAsset.js`의 운전석 로컬 `(1.65, 0.1, 0.15)`는 바꾸지 않았다.

## 수정 전 문제와 원인

1. 로컬 5개 도시는 `main.js`가 홍콩일 때만 `AmbientCitizens`를 만들어 시민이 0명이었다. 인도 그래프는 이미 있었다.
2. 주차 레이가 옥상을 지나 바닥 y 0을 집었다. 플레이어 y 95.5, 차 y 0.02.
3. BMW 탑승 실패는 앵커가 트렁크여서가 아니다. 측정한 운전석 로컬은 문 중심 `(0.74, 0.81, 0.28)`에서 1.16m, 문 바깥이다. 예전 러너가 차체·트렁크 쪽으로 걸어 3.29m에서 2.3m 규칙에 걸린 것이다. 코르벳은 문 옆 1.78m라 들어갔다.
4. 홍콩 보행은 경로가 비거나 막히면 10Hz로 `routeAt`을 0으로 되돌리며 상태는 WALK, 클립은 idle인 채로 제자리에 있었다.

## 적용한 해결

- 도시별 상한: 절차 8, 항구 6, 정원 6, 구시가 5, 스카이라인 5, 홍콩 10. 생성기 절대 상한은 10 그대로다.
- 인도 그래프가 있는 도시는 `allows`이고 건물 발자국이 아니면 바닥 y 0. 그래프가 없는 도시는 예전 레이 규칙을 유지한다. 레이가 비면 보이지 않는 바닥을 만들지 않는다.
- 주차는 같은 층의 지지면, 겹침 없음, 플레이어에서 가슴 높이로 도달 가능할 때만 성공한다. 실패하면 한국어 안내를 띄우고 차를 만들지 않는다.
- 정체 복구는 순간이동이 없다. 1.15초에 0.3m 미만이면 회복 횟수를 올리고(최대 8) 다른 방향을 한 번 찾는다. 재탐색 간격은 1.2초, 회복이 4 이상이면 2.4초다. 의도된 IDLE은 속도 0이라 이 분기를 타지 않는다. 경로가 비면 idle을 재생하지만 상태를 억지로 바꾸거나 텔레포트하지 않는다.

## 로컬 도시 시민

Chrome `vehicle-pedestrian-v3-aim.json`. 지붕에서 먼저 센 뒤, 인도 노드로 내려가 2.5초(에임 패스는 약 2초)를 봤다.

| 도시 | 인원 | 발 높이 | 걸음 | 화면 |
| --- | --- | --- | --- | --- |
| 절차 | 8 | 0.01 | 전원 2.6m 이상, 속도 1.2, 클립 walk | [procedural-aim.png](vehicle-pedestrian-v3/procedural-aim.png) 인도 위 한 명, 멀리 한 명 |
| 항구 | 6 | 0.01 | 약 3.0m, 클립 walk | [harbor-citizens.png](vehicle-pedestrian-v3/harbor-citizens.png) 인도에서 보폭 |
| 정원 | 6 | 0.01 | 약 3.0m, 클립 walk | [gardens-aim.png](vehicle-pedestrian-v3/gardens-aim.png) 인도, 멀리 둘 |
| 구시가 | 5 | 0.01 | 약 2.9m, 클립 walk | [old-town-aim.png](vehicle-pedestrian-v3/old-town-aim.png) 건물 옆 인도 |
| 스카이라인 | 5 | 0.01 | 약 3.0m, 클립 walk | [skyline-aim.png](vehicle-pedestrian-v3/skyline-aim.png) 광장 보행, 가장자리에 한 명 더 |

첫 스카이라인 문서는 90초 동안 `playing: false`라 시작 화면을 넘지 못했다. 같은 주소로 다시 열자 5명이 걸었다. 구시가도 첫 문서 중간에 프로브가 사라졌고, 다시 열자 5명이 걸었다. 인원 0으로 돌아간 것은 아니다.

옥상에 선 플레이어(절차, y 95.5 근처) 아래 거리에도 시민 8명이 y 0.01에 있었다. 지붕 위로 복사되지 않았다.

## 홍콩 시민

첫 Chrome 8초 표본. 시작 7명, 나중 근처 표본 10명.

- id 1: 4.47m, 끝 상태 WALK, 그 순간 클립 idle, 앵커 1.25m, y 20.84
- id 3: 5.46m 후 IDLE, 앵커 1.61m
- id 2: 0.63m 후 IDLE, 앵커 1.25m
- 둘 다 있던 사람 중 이동 0은 없다

이어 연 단독 세션에서 낮은 층 시민은 상태 WALK, 클립 walk, 속도 1.2, 앵커 1.25m, 경로 6칸, y 4.92였다. 높은 난간 시민도 같은 속도·앵커·클립이었다.

WALK인데 클립이 idle인 순간이 있다. 경로가 비거나 한 걸음이 막히면 idle을 틀고 1.2초 뒤에 다시 찾는다. 8초를 이동 0으로 서 있던 이전 증상과는 다르다. 건물에서 멀다고 텔레포트하지 않는다.

화면: [hong-kong-aim.png](vehicle-pedestrian-v3/hong-kong-aim.png)는 플레이어가 벽 쪽을 봐서 시민이 안 보인다. [hong-kong-aim-side.png](vehicle-pedestrian-v3/hong-kong-aim-side.png)는 난간 밖으로 떨어져 시민이 프레임 밖에 있다. 그래서 홍콩 시민의 화면 확인은 UNVERIFIED다.

## 차량 소환 높이

절차 도시.

- 미리 불러 모델을 받은 뒤, 옥상 `(-20.4, 122.47, -30)`에서 소환. 차 `(-20.4, 122.39, -23)`. 안내 “BMW 330i가 도착했습니다.” HUD 운전석 7m. [roof-summon.png](vehicle-pedestrian-v3/roof-summon.png)
- 공중 `(0, 40, 0)`은 거절. 안내 “발밑의 바닥이 확인되지 않아 차량을 놓을 수 없습니다. 땅에 선 뒤 다시 불러주세요.” 이전 차는 옥상에 남음
- 거리 `(0, 0.2, 0)`은 차 `(0, 0.02, 7)`

홍콩 시작 위치 `(0, 20.51, 0)`은 난간이라 자리가 없다. 안내 “지금 서 있는 층에는 차량이 설 자리가 없습니다. 더 넓은 곳으로 이동한 뒤 다시 불러주세요.” 차를 y 0에 내려놓지 않았다.

같은 도시의 낮은 보행 층(시민 y 4.92)에서는 차가 y 4.76에 섰고 탑승 후 1초 동안 속도 3.74m/s, z가 4.53에서 5.76으로 움직였다. [hong-kong-street-drive.png](vehicle-pedestrian-v3/hong-kong-street-drive.png)는 그 직후 0km/h에 가깝다. 흰 데크와 사진 지면 사이가 벌어져 보이는지는 이 각도에서 단정하지 않는다. 타이어가 사진 메시에 붙었는지는 UNVERIFIED다. 충돌이 고른 높이는 그 시민과 같다.

## BMW와 코르벳 탑승

문을 옮기지 않았다. 단위 검사에서 BMW 문 중심과 진입점 거리는 1.4m 미만이고, 트렁크에서 `interact`는 false, 문 옆에서는 ENTERING이다. 코르벳도 진입점이 차체 밖, 좌석과 같은 쪽이다.

Chrome은 소환된 차의 `doorPoint`에 플레이어를 둔 뒤 B 경로(`summon`)를 탔다.

- BMW: 진입 전 문 거리 7.34m(거리 원점). 문 앞으로 옮긴 뒤 ENTERING, 문 거리 0. 이어서 DRIVING. [bmw-entered.png](vehicle-pedestrian-v3/bmw-entered.png)는 후방 0km/h(막 탄 직후). 측면 이후 속도가 오른다
- 코르벳: 브레이크 후 하차, 모델 변경, `(0, 0.2, 40)`에 소환, 같은 문 진입. ENTERING 후 DRIVING

## 움직이는 바퀴

직선 도로 x 0, 차 방향 +z. 다섯 시점은 모두 속도 0.4m/s보다 크다. 막히면 다시 찍도록 해 두었으나 첫 주행이 열려 재시도는 없었다.

BMW, 차 y 0.02.

| 시점 | 속도 | 스핀 rad | z |
| --- | --- | --- | --- |
| 측면 | 6.25 m/s (23 km/h) | 10.02 | 10.40 |
| 전면 45도 | 8.18 (30 km/h) | 17.14 | 12.82 |
| 후면 45도 | 10.05 | 25.83 | 15.77 |
| 앞바퀴 근접 | 11.99 (43 km/h) | 36.68 | 19.45 |
| 뒷바퀴 근접 | 13.92 (50 km/h) | 49.43 | 23.78 |

측면→뒷바퀴 사이 스핀 증가 39.4 rad, 전진 13.38m. 반지름 약 0.34m면 호가 13.4m다. 화면: [bmw-side.png](vehicle-pedestrian-v3/bmw-side.png), [bmw-front45.png](vehicle-pedestrian-v3/bmw-front45.png), [bmw-rear45.png](vehicle-pedestrian-v3/bmw-rear45.png), [bmw-front-close.png](vehicle-pedestrian-v3/bmw-front-close.png), [bmw-rear-close.png](vehicle-pedestrian-v3/bmw-rear-close.png). 바퀴는 차체에 붙어 있고 조향은 직진이다. 모션 블러는 없다.

코르벳도 6.19→13.73 m/s, 스핀 9.86→48.26, z 50.33→63.32, y 0.02. [corvette-side.png](vehicle-pedestrian-v3/corvette-side.png), [corvette-front-close.png](vehicle-pedestrian-v3/corvette-front-close.png)에서 캘리퍼는 타이어와 따로 궤도를 돌지 않고 허브 쪽에 있다. 끝 속도 13.4 m/s, z 65.95.

스핀 식과 반지름은 그대로다. 단위 검사의 굴림은 속도 11.536, 호 11.536, 이동 11.536이다.

## 차량과 시민

절차 도시를 달리는 동안 시민은 인도에 있었다. 차가 시민을 보고 피하거나, 시민이 차를 보고 도는 전용 상태는 없다. 플레이어와 2.5m 안에서 보행 방향을 트는 기존 동작과, 사람 상자가 차체 안에 있으면 속도를 0으로 하는 기존 판정만 있다.

단위 TEST 14: 몸통이 z 3에 있으면 차가 z 1.06에서 속도 0. 시민에게 차량 공포 상태를 추가하지 않았다.

홍콩 낮은 층 주행 때 시민 수는 10이었다. 그 프레임에 차 옆 회피는 보이지 않는다.

## 성능

수치는 품질 프로브 `end().summary`. GPU 카운터는 없다. 시민 창에는 옥상에서 인도로 떨어지는 플레이어 이동이 포함된다.

| 구간 | 평균 fps | 1% | 최대 dt | 최대 드로우 | 힙 |
| --- | --- | --- | --- | --- | --- |
| 절차 8명, 7.5초 | 60.55 | 42.19 | 32ms | 27 | 36MB → 63MB |
| 항구 6명 | 60.34 | 53.19 | 29ms | 104 | 약 69–89MB |
| 정원 6명 | 60.36 | 53.19 | 27ms | 157 | 약 82–115MB |
| 홍콩 보행 8초 | 60.23 | 53.48 | 21ms | 148 | 777MB → 772MB |
| BMW 주행 2.5초 | 59.34 | 14.56 | 69ms | 448 | 87MB → 63MB |
| 코르벳 주행 2.5초 | 58.85 | 14.97 | 68ms | 147 | 102MB → 119MB |

홍콩 힙은 스트리밍 도시 크기다. 시민 7–10명이 그 힙을 만든 것으로 보지 않는다. 주행 1%가 낮은 것은 2.5초 안의 69ms 한 프레임이다. 평균은 59 근처라 상한을 올리지 않았고, 추가 최적화도 하지 않았다.

노드 단위 검사의 시민 로직 p95는 절차 4.42ms, 항구 2.61ms, 정원 4.04ms, 구시가 3.72ms, 스카이라인 3.20ms다. 브라우저 FPS가 아니다. 결과 파일 `vehicle-pedestrian-v3-unit.json`.

## 회귀 테스트

`node scripts/check-vehicle-pedestrian-v3.mjs` 결과 파일 기준. Chrome은 위 표와 같다. 테스트를 통과시키려고 기능을 건너뛰지 않았다.

| 테스트 | 단위 | Chrome |
| --- | --- | --- |
| 01 옥상 소환 | PASS, 차 y 95.02, 거리 평면 위가 아님 | FIXED_AND_VERIFIED, y 122.39 |
| 02 지상 소환 | PASS, y 1 미만 | FIXED_AND_VERIFIED, y 0.02 |
| 03 자리 없음 | PASS, 층 안내와 발밑 안내 | PASS, 공중과 홍콩 난간 |
| 04 BMW 운전석 | PASS, 트렁크 거절, 문 통과 | FIXED_AND_VERIFIED |
| 05 코르벳 운전석 | PASS | FIXED_AND_VERIFIED |
| 06 절차 시민 | PASS, 8명 보행 | FIXED_AND_VERIFIED |
| 07 항구 | PASS, 6명 | FIXED_AND_VERIFIED |
| 08 정원 | PASS, 6명 | FIXED_AND_VERIFIED |
| 09 구시가 | PASS, 5명 | FIXED_AND_VERIFIED. 첫 문서는 프로브가 끊김 |
| 10 스카이라인 | PASS, 5명 | FIXED_AND_VERIFIED. 첫 시작은 90초 타임아웃 |
| 11 홍콩 경로 복구 | PASS, x 0→4.85, 한 프레임 최대 0.04m, 텔레포트 없음 | FIXED_AND_VERIFIED. 8초 이동 0은 없음 |
| 12 건물 관통 | PASS, 발자국은 바닥이 아님, 그래프 밖 바닥 없음 | PASS, 화면의 시민은 인도·건물 옆 |
| 13 주행 중 바퀴 | PASS, 호와 거리 일치, 가속 5.8·최고 24 유지 | FIXED_AND_VERIFIED |
| 14 차·시민 동시 | PASS, 차체 앞에서 정지. 공포 AI 없음 | NOT_APPLICABLE (회피). 동시 존재는 절차 주행과 홍콩 10명에서 봄 |
| 15 도시 전환 정리 | PASS, `clear` 후 0, 새 id, `dispose` 후 슬롯 0 | PASS, 도시마다 문서가 바뀌고 인원이 누적되지 않음 |

`check-vehicle.mjs`와 `check-citizens.mjs`는 이 수정 뒤에 이전 실행에서 PASS였다. 이번 턴에는 그 둘을 다시 실행하지 않았다. 휠 식과 그래프 검사는 이번 턴에 고치지 않았다.

## 새로 본 것

SP-V3-HK-LEDGE. 홍콩 시작점 `(0, 20.5, 0)`. 난간이라 주차 자리가 없다. 기대는 거절과 안내. 실제도 그렇다. 아래층 도로로 떨어뜨리지 않는다. 심각도 낮음. 수정하지 않음.

SP-V3-HK-FRAME. 홍콩 시민을 프레임에 넣으려 하면 벽이 시야를 막거나, 옆으로 서면 플레이어가 난간 밖으로 떨어진다. 재현: `?city=hong-kong&play=solo&qualityDirector=1`, 시민 좌표에서 z−5 또는 x+4.5에 `place`. 기대는 보행자가 보인다. 실제 저장 프레임에는 플레이어만 있다. 프로브는 WALK, 1.2m/s, 앵커 1.25m. 관련 코드는 `AmbientCitizens`의 홍콩 벽면 1.2m 오프셋. 가설: 보도가 벽과 난간에 붙어 카메라 오프셋이 바닥 밖으로 나간다. 심각도 낮음. 시민을 텔레포트하지 않았다. 화면 항목은 UNVERIFIED.

SP-V3-HK-DECK. 낮은 층 소환 차 y 4.76, 시민 y 4.92. 저장 프레임은 감속 후 0km/h에 가깝고, 흰 데크 아래 사진 지면이 보인다. 타이어가 사진 메시에 붙는지는 확인하지 못했다. `ground()`는 바꾸지 않았다.

SP-V3-START. 긴 연속 실행에서 스카이라인 시작이 90초 동안 `playing: false`, 구시가·이어서 연 홍콩에서 `__shadowPulseQuality`가 한 번씩 비었다. 도시를 따로 다시 열면 된다. 게임 로직 결함으로 단정하지 않는다.

## 미검증

- 홍콩 시민의 전신 화면
- 홍콩 흰 데크에서 타이어와 사진 지면의 접촉
- 바퀴 스포크가 프레임 사이에서 어느 방향으로 돌아 보이는지(모션 블러 없음. 방향은 스핀 증가와 전진 거리로 확인)
- 원격 두 클라이언트 바퀴
- 경사로 소환. 이번 도로 피치는 거의 0. NOT_APPLICABLE에 가깝고, 경사 표면을 따로 고르지 않아 UNVERIFIED로 남긴다
- 차 뒤·차 앞에서 걸어가 탑승. Chrome은 문 좌표에 세운 탑승이다. 트렁크 거절은 단위 검사 PASS

## 추가 승인 필요

없다. 회피 AI, 상한 상향, 운전석 거리 확대, 물리 상수 변경은 하지 않았다. 커밋은 요청 전이라 하지 않는다.
