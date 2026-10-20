# 배포 게임 벽 등반·난간 진입 직접 검증 — 2026-10-20

## 결과

https://minogame.site/?city=procedural 에서 **두 외형과 서로 다른 두 외벽의 등반 → 난간 잡기 → 난간 넘기 → 옥상 착지**를 실제 키 입력으로 끝까지 완료했다. 관찰한 화면과 전환 표본에서는 손목·발목의 새로운 뒤집힘, 팔다리의 비정상적인 늘어남, 난간에서의 불필요한 이탈을 발견하지 못했다. 게임플레이 코드는 추가로 수정하지 않았다.

이는 [이전 배포 검증](../production-joints-2026-10-20/README.md)에서 미완료로 남겼던 벽 등반·난간 진입의 후속 확인이다. 이번 직접 검증의 지도는 **배포된 로컬 도시**이며, 홍콩 지도의 모든 난간까지 검증했다는 의미는 아니다.

## 실제 수행

사용자가 명시적으로 허용한 Playwright로 독립된 비로그인 Chrome 세션을 열고, 이동·점프·카메라 키·F+W 등반·Q 외형 전환을 조작했다. 페이지 로드 후 게임 상태, 좌표, 속도, 자세를 강제로 설정하지 않았다. 내부 게임 객체 대신 화면의 상태·미니맵 좌표 DOM과 렌더링 화면만 읽었다.

| 외형 | 외벽에서 관찰한 좌표 | 상단 전환 | 옥상 도착 |
| --- | --- | --- | --- |
| 와이어 | E -98m / N +107m, 고도 5m부터 95m까지 상승 확인 | WALL RUN → MANTLING (4개 HUD·화면 표본) | PULSE READY, E -98m / N +104m, 고도 95m |
| 전투 | E -107m / N +102m, 고도 18m부터 상승 확인 | WALL RUN → MANTLING (5개 HUD·화면 표본) | COMBAT READY, E -104m / N +102m, 고도 95m |

양쪽 모두 입력을 유지한 채 난간 진입을 마쳤고, 옥상 도착 후 키를 해제했다. 와이어 외형은 옥상 안쪽으로 더 걸어 손발이 보이는 자세를 확인했다. 전투 외형은 키 해제 후 고도 95m에서 정지 상태가 유지되는 것을 재확인했다. 전환 표본에는 낙하 상태가 끼어들지 않았다.

## 근거

- [상태·좌표 기록 141개](hud-observations.json), [결과와 상태 순서 검증](results.json), [배포 번들 경로](live-bundle.json)
- [와이어 등반·난간 전환 연속 영상](web-climb-mantle.webm), [전투 등반·난간 전환 연속 영상](combat-climb-mantle.webm)
- [와이어 난간 전환 화면](web-mantle-inspection.jpg), [전투 난간 전환 화면](combat-mantle-inspection.jpg)
- [와이어 영상 전환 16표본](web-video-transition-inspection.jpg), [전투 영상 전환 16표본](combat-video-transition-inspection.jpg)
- [와이어 착지 후 손발](web-roof-stable.png), [전투 착지 후 손발](combat-roof-stable.png)

영상은 Playwright가 기록한 1440×1000 / 25 FPS 화면에서 상단 등반과 난간 전환을 포함한 구간을 잘라낸 것이다. 정지 화면 표본 외에 전환 영상에서 추출한 연속 표본도 확인했다. 가려진 관절이나 모든 프레임·모든 지형의 무결함을 보증하는 결과는 아니다.

## 관련 자동 검증

다음 명령을 실행했고 모두 통과했다.

```sh
node scripts/check-wall-ledge.mjs
node scripts/check-wall-ledge-rig.mjs
node scripts/check-natural-wall-motion.mjs
```

- 난간 동작 7개 검사 통과, 실제 도시 80면에서 79개 안전 진입·1개 막힌 지형의 잡기 유지.
- 실제 지형의 부동소수점 이음부에서 24/30/60/144 FPS 옥상 도착 통과.
- 실제 리그의 30/60/144 FPS 난간 전환 통과.
- 외형·프레임률·벽 방향을 포함한 자연스러운 벽 접촉 36/36 통과.

추가 문제를 재현하지 못했으므로 이번 변경은 검증 보고서·화면·영상에 한정한다.
