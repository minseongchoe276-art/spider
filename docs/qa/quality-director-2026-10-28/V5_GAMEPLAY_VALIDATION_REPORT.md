# SHADOW PULSE V5 게임플레이 검증

날짜: 2026-10-28  
기준: 로컬 `http://127.0.0.1:5191` · Chrome · 프로브 `quality-director-v5`  
저장소 HEAD: `d8bbc3a`  
커밋·푸시·운영 Render 요청·플레이어 데이터 변경은 하지 않았다.  
V4 문구, 태그 시간, 에너지 와이어 명칭, 게임패드 문장, 터치 탭 유지는 그대로다.

회피 거리·무적·쿨타임·속도 곡선, 경찰 가드 배율 0.4, 웹 물리, 전투 수치, 애니메이션 원본, 입력 매핑, 카메라, 서버 판정은 바꾸지 않았다.  
회피 모션과 도망자 방어 규칙은 승인 전이라 적용하지 않았다.

상태 어휘는 PASS, FAIL, FIXED_AND_VERIFIED, UNVERIFIED, BLOCKED, NOT_APPLICABLE만 쓴다.

증거: `v5-live.json`, `v5-follow.json`, `v5-roll.json`, `v5-frames.json`, `guard-v5/delays.json`, `shots/v5/`.

## 플레이한 시나리오

시드 `20261028`. 절차 도시는 솔로 `?qualityDirector=1`. 홍콩은 같은 프로브. 멀티플레이는 Vite에 붙은 로컬 방만 썼다.

| 시나리오 | 상태 | 결과 |
| --- | --- | --- |
| 모션 카탈로그 | PASS | 구르기 1.543초, authored false. 회피 클립 4종은 없음. fallVariant는 로드만 되고 재생 선택은 없음 |
| 넓은 바닥 착지 구르기 | PASS | 88프레임 `ROLLING` / 클립 `roll`. 아래 시각 항목 참고 |
| 정지 구르기 | NOT_APPLICABLE | 지상 구르기 입력이 없다. 착지 조건으로만 들어간다 |
| 구르기 중 이동·점프, 종료 후 공격·질주 | UNVERIFIED | 성공한 재생 구간에서 그 입력을 넣지 않았다 |
| 앞 회피 거리 | PASS | 캡슐 0.761m. 속도 2.3 × 0.52 × 2/π = 0.761. 클립은 `combatIdle` |
| 뒤 회피 거리 | PASS | 캡슐 0.362m. 적분 0.361. 클립 `combatIdle` |
| 좌 회피, 공중 | UNVERIFIED | 낙하 중이라 `dodge`가 false. 속도 버그가 아니다 |
| 우 회피, 착지와 겹침 | UNVERIFIED | 캡슐 0.144m. 적분은 0.194. 착지 클립과 섞였다 |
| 정지 잽 발 | PASS | 캡슐 0, 발 상대이동 0.001m |
| 달리기 잽·크로스·헤비, 질주 잽 | PASS | 하체는 걸음 클립. 발은 몸과 함께 돈다. 전신 클립으로 바꾸지 않음 |
| 짧은 스윙 | PASS | 줄 11.211m, 카메라 롤 0, 첫 부착 손목 32.6°. 4초 좌우 궤적은 아님 |
| 4초 좌우 스윙 | UNVERIFIED | 앵커가 11.6m였다. 가로 이동은 z 약 4.3m |
| 지면 벽 타기 | PASS | `RUNNING` → `WALL_RUNNING`, 클립 `wall` |
| 시드 24타 | PASS | 위치 `[106.7, 3.333, 90.442]` 유한. 키는 8개 주기로 반복 |
| 홍콩 시민 1명 생성 | PASS | 프로브 1명, WALK, 앵커 4.42m |
| 홍콩 시민이 화면에 읽힘 | UNVERIFIED | 플레이어가 낙하 중이었다 |
| 홍콩 BMW 소환 | PASS | `PARKED`, 문 7.36m, 도착 문구 |
| 탑승·조향·바퀴 회전 | UNVERIFIED | 문까지 가지 않았다 |
| 로컬 2인 어퍼컷 화면 | UNVERIFIED | 방 `A1C443`, 간격 22.4m, 시작 보호 6초, 양쪽 HP 100 |
| 어퍼컷 서버 피해 48 | PASS | 로컬 소켓 9건. 운영 서버는 호출하지 않음 |
| 가드 패킷 100/250/350ms | PASS | 배율은 그대로. 아래 표 |
| 소리 음질 | UNVERIFIED | 호출 횟수만 있다. 듣지 않았다 |

## 회피 발 미끄러짐

카탈로그에 `dodgeLeft`, `dodgeRight`, `dodgeBack`, `dodgeForward` 클립이 없다. `Character.js`는 회피 키를 `combatIdle`로 바꾸고, 수평 속도 3.4m/s 미만의 지면 회피도 `combatIdle`을 유지한다. `poseCombatLife`는 같은 사인 봉투로 척추와 머리만 기울인다. 발은 밟지 않는다. 그 다음 `plantMovingFeet`가 지면 접촉에서 다시 발을 심는다.

실측은 속도 곡선을 유지한 상태다.

- 앞: 캡슐 0.761m, 발 상대이동 0.299m, 클립 `combatIdle`, 발 간격 0.125–0.243m
- 뒤: 캡슐 0.362m, 발 상대이동 0.218m, 클립 `combatIdle`
- 옥상 재측정 앞: 캡슐 0.678m, 발 상대이동 0.288m, 클립 `combatIdle`

캡슐이 약 0.76m 가는 동안 발의 상대 이동은 0.30m다. 발이 바닥에 붙어 한 걸음을 만드는 양이 아니고, 대기 자세가 통째로 미끄러진다. `shots/v5/dodge-ground-left.png`는 회피가 끝난 뒤의 `IDLE` / `combatIdle` / 0.0m/s라서 미끄러짐 도중 프레임이 아니다.

Root Motion은 없다. 이동은 `Combat.js`의 사인 속도다. 좌우 정점 0.8m/s · 0.38초, 뒤 1.35 · 0.42, 앞 2.3 · 0.52. 무적 0.28초. 기력 18.

승인 전 설계. 적용하지 않았다.

- 지금: 상체 기울기만. 측정된 미끄러짐이 이 경로다.
- 최소 수정: 속도·무적·쿨타임은 그대로 두고, `plantMovingFeet` 이후에만 회피 방향으로 앞발·뒷발을 약 0.12–0.22m 벌린다. 같은 사인 봉투. `poseCombatLife` 안에만 넣으면 발 심기가 덮어쓴다.
- 손댈 파일: `src/Character.js`의 회피 발 순서. 필요하면 `src/CharacterPose.js`.
- 하지 않을 것: 클립 교체, 속도 변경, Root Motion.

## 도망자 방어 — SP-V4-GUARD

상태: FAIL. 이번에도 재현했다. 고치지 않았다.

공식 클라이언트에서 F는 와이어 모드의 벽 동작이다. 도망자는 와이어에 고정된다. `Combat.guard`는 `allowGuardInWeb`일 때만 와이어에서 가드를 연다. 멀티플레이는 태그 도망자에게 그 플래그를 켠다. 서버는 받은 이동마다 `allowRunnerGuard`를 태그 도망자에게 세운다. 로컬 검사에서 위조한 가드 자세의 주먹 피해는 10이고, 규칙은 `changed: false`다. 정면 감소가 적용된 값이다. 막지 않은 주먹은 25다.

| 기준 | A. 서버에서 거부 | B. 정식 활성화 |
| --- | --- | --- |
| 태그 균형 | 도망자는 지금처럼 줄과 벽으로 산다 | 가드가 추격을 늦춘다 |
| 경찰 추격 | 정면 감소를 위조로 받을 수 없다 | 경찰 주먹이 더 자주 10이 된다 |
| 도망자 생존 | 벽과 줄은 유지 | 생존 수단이 늘지만 F를 뺏긴다 |
| F 충돌 | 없음. F는 벽 | F에 가드를 올리면 벽 타기를 잃는다 |
| 서버 검증 | 자세만으로 감소가 생기지 않게 닫는다 | 입력과 서버 플래그를 같이 열어야 한다 |
| 위조 클라이언트 | 막힌다 | 정식 입력이 없으면 위조가 남는다 |
| 기존 방 | 이동 패킷 형식은 유지하고 감소만 거절 | 새 조작이 필요하다 |

추천은 A다. 경찰 배율 0.4, 원뿔 0.5, 신선도 350ms, 막힌 주먹 10 / 와이어 6은 유지한다. B는 별도 버튼이 없으면 F와 벽이 겹친다.

승인 후 같이 수정할 파일: `scripts/rooms.mjs`, `src/AttackRules.js`, `src/Multiplayer.js`, `scripts/check-online-guard.mjs`. 테스트 기대값만 먼저 바꾸지 않는다.

## 구르기

첫 방법은 지붕 가장자리에서 수평 속도가 착지 판정 전에 줄었다. 상태 `FALLING`/`LANDING`, 클립 `drop`/`fall`/`land`, 구르기 0프레임. UNVERIFIED로 남긴다. 기능이 삭제된 것이 아니다.

두 번째 방법은 가로 32m 바닥을 찾았지만 Playwright 왕복이 낙하 속도를 놓쳤다. `shoved: false`, 구르기 0프레임.

세 번째 방법은 페이지 안의 프레임 루프다. `findRollDeck`가 넓이 1024, 높이 94.112의 바닥에 세운 뒤 `raise(8)`과 `shove(7, 0)`를 바로 호출했다.

| 항목 | 측정 |
| --- | --- |
| 상태 | `FALLING`, `ROLLING` |
| 클립 | `drop`, `fall`, `roll` |
| 구르기 프레임 | 88, 클립 이름 `roll` |
| 수평 최대 | 6.97m/s |
| 낙하 최저 | −20.77m/s |
| 몸 높이 | 94.092. 바닥 94.112 |
| 발 간격 최소 | 0.164m. 음수 없음 |
| 낮은 샘플 무릎 | 114.8° |

연속 화면 `roll-mid-0.png`, `roll-mid-1.png`, `roll-mid-2.png`의 HUD는 `ROLLING`이고 속도는 3.9, 4.4, 1.9m/s다. 세 장 모두 카메라가 하늘을 본다. 직전 와이어 조준의 위쪽 피치가 남아 있다. 몸통 회전, 발 접지, 종료 자세는 화면으로 확인하지 못했다. 그 세 가지는 UNVERIFIED다. 프로브 발 간격은 0.700, 0.359, 0.542m로 지면 관통이 아니다.

`check-combat-roll-recovery.mjs`의 24fps 구르기 구간은 관통 단언을 지나갔고, 그 다음 특수기 단언에서 파일이 멈췄다. 60fps와 144fps 구르기 구간은 실행되지 않았다.

정지 구르기, 구르기 중 방향 전환, 종료 직후 공격과 질주는 UNVERIFIED다.

## 전투 발

발 상대이동은 캡슐 기준 왼발 위치의 범위다. 캡슐만 움직이고 이 값이 거의 0이면 굳은 발이 미끄러진다.

| 동작 | 캡슐 | 발 상대이동 | 클립 | 판정 |
| --- | --- | --- | --- | --- |
| 정지 잽 | 0 | 0.001m | `combatIdle` → `jab` | PASS. 발이 심어져 있다 |
| 달리기 잽 | 3.043m | 0.740m | `regularRun` | PASS. 걸음이 발을 움직인다 |
| 질주 잽 | 4.509m | 0.716m | `run` | PASS |
| 달리기 크로스 | 2.836m | 0.706m | `regularRun` | PASS |
| 달리기 헤비 | 3.330m | 0.710m | `regularRun` | PASS |

원인은 클립 교체가 아니다. 이동 중 공격은 하체를 걸음으로 둔다. 상체가 펀치 클립으로 갈라지지 않는 것은 기존 표현 한계다. 전신 클립으로 바꾸지 않았다. 질주 중 급정지, 공격 중 방향 전환, 공격 후 회피는 이 표에 없다. UNVERIFIED.

자동 검사 `check-low-stance.mjs`는 달리기 4.4m/s 훅의 발이 비무장 달리기보다 0.136m 벌어져 실패했다. 한계는 0.08m다. 훅은 플레이어 버튼이 없고 E는 헤비다. 클립은 바꾸지 않았다. 기대값도 바꾸지 않았다.

`check-combat-feet.mjs`는 정지 훅 60fps에서 발 가로 롤 25.065°로 실패했다. 한계는 25.05°다. 0.015° 차이다. 한계를 넓히지 않았다.

## 웹스윙, 카메라, 손목

`seekWebTarget`이 잡은 앵커는 11.554m, 위치 `[99.6, 104.87, 96.11]`이다. 3.2초 동안 스윙 또는 줄이 있는 샘플이 191개다. 그중 8프레임마다 저장한 12개의 범위는 다음과 같다.

- 줄 길이 11.211m에서 2.169m로 줄었다. x는 99.6에 고정. z는 90.583에서 94.9. 이동 약 4.3m.
- FOV는 저장된 샘플에서 73.35까지 올랐다가 64.01로 돌아왔다. 속도에 따라 움직인다. 최저점 전용 트리거는 없다.
- `tpsCamera.roll`은 저장 샘플 전부 0이다. 오일러 z를 뱅크로 보지 않았다.
- 손목과 앵커 사이 각은 첫 구간 28.2–37.2°, 줄이 짧아진 뒤 15.8–17.3°.

`swing-mid-0.png`는 상태 `SWINGING`, 클립은 아직 `jump`, 속도 25.1m/s, HUD 90km/h, 고도 100m, 줄 11.211m, FOV 66.8, 롤 0, 손목 32.6°다. 코드의 콕은 `reachWebAnchor`의 32°이고 손 쿼터니언에 0.95로 섞인다. 첫 부착 프레임은 그 값과 0.6° 차이다. 짧은 줄의 후반 각도는 32°에 고정되지 않는다. 이것만으로 콕 상수를 바꾸지 않는다. 관절 한계 12°도 유지한다.

`swing-raf.png`는 손을 뗀 뒤다. HUD `FALLING` `fall`, 18.8m/s, 68km/h. 웅크린 낙하 자세다. 줄은 화면에서 확인하지 않았다. 해제 직후 상태는 `FALLING:drop`, `FALLING:fall`이다.

벽 전환의 첫 프레임은 지면에서 `wall` 클립으로 들어갔다. 공중에서 F를 누른 시도는 점프 상태라 UNVERIFIED로 남긴다.

4초 좌우 왕복, 스윙 최저점만의 FOV, 웹 발사 첫 프레임의 줄 가시성, 벽 타기 첫 프레임의 손목은 UNVERIFIED다. 물리 상수는 변경하지 않았다.

## 홍콩 시민과 차량

시민은 홍콩에서 충돌이 준비된 뒤 1명이 프로브에 있었다. 위치 (−22.56, 20.86, 8.93), 상태 WALK, 클립 walk, 속도 0, 인도 앵커 4.42m. `approachCitizen`은 지지 높이가 없어 y를 맞추지 못했고 플레이어는 낙하했다. `shots/v5/hong-kong-citizen.png`는 `FALLING` 15.6m/s, 56km/h다. 가까운 보행자, 경로, 건물 충돌, 횡단, 시민끼리의 충돌은 UNVERIFIED다. 생성 실패는 아니다.

차량 첫 시도는 낙하 중이라 문이 17m였다. 바닥 레이 실패가 아니다. 접촉 높이는 5.02–5.05m이고 상태는 `PARKED`, 모델 bmw, 바퀴 회전 0이다. 스폰만 다시 하면 문 7.36m, 문구는 “BMW 330i가 도착했습니다. 운전석 옆에서 B를 눌러 탑승하세요.”다. 소환은 PASS. 탑승, 조향, 바퀴 회전, 운전 카메라는 UNVERIFIED다.

## 멀티플레이와 가드 신선도

로컬 커스텀 2인. 코드 `A1C443`. 호스트 V5Host, 게스트 V5Guest. 시작 뒤 22.4m, 양쪽 HP 100, 원격 모션 idle, 알림 “시작 보호 6초 · 아직 피해 없음”. 공격 시작·종료, 피격, 화면 피해, 가드, 어퍼컷 모션, 기력, 쿨타임, 재접속은 이 세션에서 UNVERIFIED다. 4인은 실행하지 않았다.

어퍼컷 피해는 `node scripts/check-uppercut-online.mjs`가 로컬 소켓에서 9건 PASS다. 피해 48, 정면 가드 20, 뒤는 전액, 일반 주먹 25, 이른 접촉, 공중, 쿨타임 8초, 사거리 2m, 잘못된 변형. 기록은 `docs/qa/dashing-uppercut-2026-10-27/online.json`. Chrome에서 48이 맞는지는 UNVERIFIED다.

가드 신선도 350ms. 로컬 2인, 도시 홍콩, y 200. 검사 중에만 시작 보호와 쿨타임을 0으로 두고 끝에서 되돌렸다. 배율은 변경하지 않았다.

| 경우 | 피해 | 기대 |
| --- | --- | --- |
| 가드 패킷 후 100ms | 10 | 10 |
| 가드 패킷 후 250ms | 10 | 10 |
| 패킷이 350ms를 넘겨 멈춤 | 25 | 25 |
| 가드 패킷 재개 | 10 | 10 |
| 서 있지만 이동 패킷은 계속 | 10 | 10 |
| 도망자 위조 자세 | 10 | 10, 규칙 변경 없음 |

패킷이 끊기면 감소가 풀린다. 서 있는 것만으로는 풀리지 않는다. 클라이언트가 정지 중에도 약 100ms마다 이동을 보낸다. 도움말에 350ms를 넣지 않았다.

`check-online-guard.mjs`도 이어서 실행되어 12건 PASS를 출력했다. 출력 파일은 기본 경로라 `docs/qa/eight-player-2026-10-21/online-guard.json`의 수정 시각이 바뀌었고, git diff는 비어 있다. 내용은 HEAD와 같다.

## 사운드와 VFX

호출 횟수다. 음질, 클리핑, 피로도, 동시 재생은 듣지 못했으므로 UNVERIFIED다. PASS로 올리지 않는다.

| 호출 | 횟수 |
| --- | --- |
| playSurfaceStep | 24 |
| playLand | 4 |
| playWebFailure | 6 |
| playWebShoot | 3 |
| playJump | 3 |
| playSlingshotBoost, playTrickSound, playCheckpointChime, playCombatHit | 이 세션 횟수 없음 |

묘기, 체크포인트, 명중, 슬링샷 입력은 이 플레이에 없었다. 함수 누락으로 단정하지 않는다. 착지 충격파 5회와 착지 소리 4회는 짝을 맞추지 않았다. 중복 재생으로 단정하지 않는다.

VFX는 `spawnLandingShockwave` 5, `spawnWebImpact` 1, `spawn` 1이다. 화면을 가리는 정도, 프레임 드롭, 글로우와 데칼의 자연스러움은 UNVERIFIED다.

## 새 시드 탐색

시드 20261028의 24타는 `D F E W G S A Space`가 세 번이다. 위치는 유한하고 상태는 `JUMPING`이다. 연기 테스트로는 PASS다. 깊은 커버리지는 아니다.

따로 재현을 만들지 못한 조합은 UNVERIFIED다. 고속 스윙 직후 공격, 공격 중 착지, 착지 직후 회피, 구르기 직후 점프, 웹 해제 직후 벽, 카메라 회전 중 공격, 2인 동시 공격, 주행 중 시민 접근, 장시간 플레이. 고속 스윙 직후의 샘플은 낙하로 이어졌고 공격으로 이어지지 않았다. 착지 직후 오른쪽 회피는 시작됐지만 거리가 착지와 섞였다.

## npm test

`package.json`의 `test`는 로컬 스크립트 `&&` 체인이다. `check-hong-kong-operating`, `check-upgrade-supabase`, `check-public-room-server`, `check-room-server`, `test:postgres`는 포함되지 않는다. 그 스크립트는 실행하지 않았다. `check-admin`과 `check-admin-db`는 체인 안에 있고, 토큰과 데이터베이스는 프로세스 로컬이다. admin-db는 “presence counts, hidden tables, key lockout” PASS다.

체인은 실패에서 멈추므로, 원인을 가린 뒤 기대값은 그대로 두고 다음 스크립트만 이어서 실행했다.

| 스크립트 | 분류 | 처리 |
| --- | --- | --- |
| check-cross-system-regressions | 테스트 픽스처. `applyPreferences`의 `vfx`가 없음 | `vfx:{}`, `character:{}`만 추가. FOV 기대값 유지. 재실행 PASS |
| check-web-continuity | 환경. Node에서 `import.meta.env`가 없음 | `import.meta.env?.DEV`. 재실행 PASS |
| check-expert-audit | 테스트 픽스처. `vfx` 없음, 연습 더미에 `bar.material` 없음 | 실제 `spawn()`처럼 Mesh를 줌. 명중 기대는 1 유지. PASS 10 |
| check-full-game-audit | 같은 `vfx` 구멍 | 실행 전에 `vfx:{}`. 9 passed, 0 failed |
| check-motion-cleanup | 오래된 기대값 | 크로스 원본이 HEAD부터 `Punching.fbx`. 테스트는 `Lead Jab (3).fbx`. 기대값을 바꾸지 않음. 25 pass, 1 fail |
| check-combat-feet | 경계값 | 훅 60fps 가로 롤 25.065° / 한계 25.05°. 한계를 바꾸지 않음 |
| check-combat-roll-recovery | 테스트 기대와 특수기 규칙 | 속도 1.5m/s 특수기는 클립 `special`을 유지. 테스트는 걸음 클립을 요구. 특수기를 이동 공격으로 바꾸지 않음 |
| check-motion-combinations | 같은 특수기 규칙 | 질주 잽·크로스·훅·헤비는 `run`. 특수기만 `special`. 기대값을 바꾸지 않음 |
| check-low-stance | 측정된 발 차이 | 달리기 훅 발 0.136m, 한계 0.08m. 클립을 바꾸지 않음 |
| 그 외 체인 | PASS | 위 실패 지점 다음을 이어서 실행. 마지막 `check-stance-combat`, `check-low-stance-online` PASS |

전체 `npm test` 한 번에 녹색은 아니다. 실패 네 건은 기대값이나 게임플레이를 고쳐서 숨기지 않았다. 픽스처 세 건과 Node의 `import.meta.env`는 재실행으로 통과했다.

## 프로덕션 번들

`npm run build` EXIT 0. 배포하지 않았다.  
`dist/assets/index-B3NTavQ-.js`에서 `qualityDirector`, `__shadowPulseQuality`, `QualityDirector`, `reviewDodge`, `quality-director`, `findRollDeck`, `seekFarAnchor`는 0건이다. 다른 청크도 0건이다.  
`dist/index.html`의 거미줄은 0, 에너지 와이어는 11이다.  
`import.meta.env?.DEV`로 바꾼 뒤에도 프로브 문자열은 빠진다. SP-V4-PROBE는 이 번들 기준으로 FIXED_AND_VERIFIED다. V4 표의 `index-Cpt28IB8.js`는 이전 빌드다.

## 수정한 파일

게임 규칙, 속도, 피해, 물리, 클립, 입력, 카메라는 수정하지 않았다. 전후 비교로 개선 완료라고 부를 플레이 변경은 없다.

| 파일 | 변경 | 전 | 후 |
| --- | --- | --- | --- |
| `src/main.js` | 개발 판정만 `import.meta.env?.DEV` | Node가 `DEV` 읽기에서 중단 | `check-web-continuity` PASS. 프로덕션 문자열 0 |
| `src/QualityDirector.js` | 측정용 `findRollDeck`, `seekFarAnchor`, `wristCock`, `room` | 구르기 창을 놓침 | 88프레임 구르기, 191샘플 스윙. 물리 식은 그대로 |
| `scripts/check-cross-system-regressions.mjs` | 픽스처에 `vfx`, `character` | `reducedMotion` TypeError | 같은 FOV 단언 PASS |
| `scripts/check-expert-audit.mjs` | 픽스처 `vfx`, 연습 바 Mesh, `maxHealth` | `vfx`와 `bar.material` TypeError | PASS 10. 투사체 명중 1 유지 |
| `scripts/check-full-game-audit.mjs` | 픽스처 `vfx` | 같은 TypeError가 날 자리 | 품질 동기 포함 9건 PASS |
| `scripts/quality-director/v5-*.mjs` | 로컬 측정 스크립트 | 없음 | JSON과 스크린샷 |

`check-expert-audit.mjs`의 공중 기술 접촉 시간 문장은 이번 픽스처 수정 이전에 작업 트리에 있던 차이다. 피해와 속도는 건드리지 않았다.

## 승인이 필요한 변경

- 회피 발. 추천은 속도 유지, `plantMovingFeet` 뒤의 절차적 스텝. 클립 추가는 없다.
- 도망자 방어. 추천은 A, 서버가 위조 가드를 거부. F는 벽으로 둔다.
- 전투 수치, 물리, 입력, 카메라, 모션 교체, 서버 판정은 제안만 있고 패치는 없다.

## 남은 미검증

- 구르기 몸의 화면, 구르기 중 입력, 구르기 뒤 공격·질주
- 4초 좌우 스윙과 그 최저점 FOV
- 회피 도중 프레임. 있는 사진은 종료 후다
- 홍콩 시민의 가까운 화면, 보행, 횡단
- BMW 탑승, 조향, 바퀴, 운전 카메라
- 로컬 2인 공격 동기, 화면상의 어퍼컷 48, 재접속
- 소리 음질, VFX 가림, 프레임 드롭
- 시드가 커버하지 않은 복합 입력
- 일반 Chrome의 Pointer Lock

## 문제

### SP-V4-GUARD

분야: 멀티플레이 태그  
심각도: 중간. 공식 입력으로는 안 되고, 수정된 클라이언트의 자세로 주먹 25가 10이 된다.  
재현: 로컬 태그 도망자 이동에 가드 자세를 실어 주먹을 맞춘다.  
실제: 피해 10. 기대: 공식 클라이언트와 같이 감소 없음.  
증거: `guard-v5/delays.json` 마지막 행, `changed: false`.  
원인: 서버가 `allowRunnerGuard`를 세우고 피해 계산이 그 자세를 인정한다.  
수정: 승인 전. 추천 A.  
회귀: 경찰 가드 0.4와 벽 타기 F.  
검증: FAIL. 재현만 했다.

### SP-V4-PROBE

분야: 프로덕션 번들  
상태: FIXED_AND_VERIFIED  
증거: `dist/assets/index-B3NTavQ-.js` 검색 0건. 배포하지 않음.
