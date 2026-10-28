# 애니메이션 검사

## 개수

지시문은 57개를 말했다. 2026-10-28 탐색 결과는 다르다.

- `src/MotionCatalog.js`의 `MOTIONS`: 37
- `public/motions/*.json` (manifest 제외): 37
- `public/motions/manifest.json`의 `count`: 37
- 아카이브로만 있고 카탈로그에 없는 클립: 없음

57이라는 수는 현재 트리에 없다.

## 기술 검사

`scripts/quality-director/audit-motions.mjs`가 각 클립을 실제 릭의 `fadeToAction`으로 30fps 전 구간에 올렸다.

검사: 로드, 본 쿼터니언 단위 길이, 유한값, 힙을 제외한 본의 길이 유지, 말단 속력 30m/s 미만, 무릎 각은 기록만.

결과: TECHNICAL_PASS 37, FAIL 0.  
시각 판정은 이 스크립트가 하지 않는다. `visual`은 전부 UNVERIFIED로 남겼다.

통과 키: idle, walk, regularRun, run, stop, runStop, zip, turnLeft, turnRight, jump, jumpDown, drop, jumpDownVariant, swing, fall, fallVariant, fallIdle, roll, injuredIdle, wall, land, combatIdle, jab, guard, slam, slamLand, hitHead, rightHook, cross, hook, heavy, airTrick, backTrick, hitBody, hitHeavy, hitUppercut, special.

## 눈으로 본 정지 화면

`?motionReview=1`에서 슬라이더 약 45% 한 장씩. 클립 전체가 아니다.

| 클립 | 그 프레임에서 본 것 | 판정 |
| --- | --- | --- |
| run | 중간 보폭, 팔 굽힘, 무릎이 진행 방향으로 읽힘 | 그 프레임은 달리기로 읽힌다 |
| jab | 0.53초 / 1.33초. 주먹이 뻗기보다 가드에 가깝다 | 타격 프레임이라고 말하지 않는다 |
| hook | 0.56초 / 1.40초. 한 팔이 앞으로 뻗은 직선 주먹에 가깝다 | 넓은 훅으로 보이지 않았다 |
| special | 0.48초 / 1.20초. 한 팔이 위로 올라가 어퍼컷으로 읽힌다 | 그 프레임은 읽힌다 |
| swing | 상체를 젖히고 한 팔을 든 공중 자세 | 줄이 없는 클립 미리보기 |
| land | 상체가 앞으로 숙고 한 발이 뒤 | 착지 회복으로 읽힌다 |
| fall | 머리가 아래인 수평 낙하 | 그 프레임은 읽힌다 |
| wall | 그리드 위에 외발. 벽 접촉은 이 리뷰 장면이 만들지 않는다 | 벽 품질 판정 아님 |

idle, walk는 게임 플레이 화면에서 서 있는 자세와 이동 후 정지를 봤다. 관절이 뒤집힌 정지 화면은 이 8장에서 찾지 못했다. 그것만으로 37개 시각 통과는 아니다.

## 게임 안 전환

실제로 상태가 바뀐 것만 적는다.

- 걷기: RUNNING, 클립 walk → regularRun → stop → idle
- 질주: SPRINTING, 클립 run → runStop
- 점프: JUMPING → FALLING, 클립 jump, drop
- 스윙: IDLE → SWINGING, 클립 swing
- 전투: jab, cross, heavy, special 키가 샘플에 남음

하지 않은 조합: Attack→Dodge, Attack→Hit, Swing→Attack, Turn→Attack, Sprint→Attack의 관절 불연속. 기존 `npm test`의 `check-motion-combinations`는 이번 세션에서 다시 돌리지 않았다.

## 판정

기술: TECHNICAL_PASS 37/37.  
시각: 위 프레임만 관찰. 나머지는 UNVERIFIED.
