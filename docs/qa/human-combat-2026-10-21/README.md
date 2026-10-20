# 인간 모드 · 이동 시선 · 방어 보행 수정

## 확인한 원인과 수정

- 이동 중 복싱 상체의 로컬 회전을 보행 골반에 그대로 이식해 기준 좌표가 달라졌다. 최상위 척추 트랙을 원본 전투 골반 기준에서 현재 보행 골반 기준으로 변환한다. 보행 골반과 다리는 유지한다.
- 방어 중 이동도 전신 가드 클립을 선택해 실제 이동과 다리 모션이 맞지 않았다. 이동 가드는 보행 다리 위에 가드 상체를 겹친다. 실제 방어 이동 속도는 종전 35%를 유지한다.
- 원본 전투 자세의 비스듬한 시선은 목·머리에 분산해 진행 방향으로 정렬한다. 실제 스킨 바인드 행렬에서 머리의 앞쪽 축을 구하고 부드럽게 반영한다. 공격 중에는 타격의 몸통 회전을 유지한다.
- 인간 모드의 와이어 잠금이 지상에만 적용돼 공중의 클릭·당기기·E 집이 살아 있었다. 모든 상태에서 와이어 물리를 잠그고 인간 모드의 공중 마우스 입력 및 온라인 거미줄 공격을 차단한다. 변신 시 기존 줄과 발사 잔상을 정리한다.
- 인간 모드의 원격 포즈에서 줄·발사 잔상을 제거한다. 터치 조작 및 조준/손 상태 안내도 공중 와이어 대신 인간 모드와 착지 후 공격을 표시한다.

## 검증

- `node scripts/check-human-mode.mjs`: 24/60/144 FPS, 3개 진행 방향, 달리기 및 실제 가드 보행 속도의 18개 실제 뼈대 사례. 정착 후 머리 진행 방향 오차 3° 미만, 가드 중 보행 클립·다리 움직임 유지. 지상/점프/낙하에서 줄·당기기·집/온라인 공격 차단, 원격 포즈 잔상 정리.
- 실제 WebGL 검수 페이지에서 달리기와 가드 보행을 렌더링했다. `guard-walk.png` 참고.
- `check-gameplay`, `check-pendulum`, `check-touch-controls`, `check-combat-traversal`, `check-combat-quality`, `check-moving-combat-skin`, `check-expanded-input-camera`, `check-remote-motion`, `check-multiplayer`, `check-input-lifecycle`, `check-session-flow`, 사용자 설정 검사 및 빌드 통과.
- 전체 검사에 새 사용자 설정 및 인간 모드 회귀 검사를 추가했다. `npm run test:human`으로 집중 재현할 수 있다.

배포 및 공개 검증 정보는 `../custom-release-2026-10-20/` 기록과 후속 공개 검수 기록을 함께 참조한다.

추가 검증: `check-combat-feet`의 연속 동작 45개 + 타격/가드 복귀 고정 구간 75개(24/60/144 FPS, 제자리/달리기/질주) 모두 통과했다.

## 최종 공개 배포

- 운영 코드 커밋: `cc8b676eaa3cfcd6ff0de04723a2e9bf9acd670f`.
- 프런트: https://minogame.site/ — GitHub Vercel success 및 `frontend.json`에서 공개 JS와 로컬 빌드 바이트 일치 확인.
- 방 서버: `dep-dbbvfo3l550s73a86v10` live, `/healthz`의 revision 동일, 공식 지형 seed CLEAR, 배포 후 오류 로그 없음.
- 최종 서버에 공개 8명 4대4 및 3인 개인전 재검사 통과. `public-custom.json` / `public-custom.log` 참고.
- 공개 게임에서 인간 모드로 점프한 직후 클릭·E를 입력해도 JUMPING과 인간 모드 표시를 유지하고 줄/집으로 전환하지 않는 것을 확인했다. `public-air-human.png` 참고.
- 공개 모션 검수 화면에서도 수정된 방어 보행을 렌더링했다. `public-guard-walk.png` 참고.
- 실제 B+W를 CombatSystem과 SwingPhysics에 함께 입력한 24/60/144 FPS 3개 사례도 추가했다. 방어 유지, 35% 보행 속도 및 walk 다리 모션을 확인했다.
- 변경 후 추가 회귀 12종은 `post-change-suite.json`에 모두 PASS로 기록됐다.

공개 서버 검사는 임시 방만 사용했다. 기존 무료 Render 인스턴스를 유지했다. 잠든 무료 인스턴스의 최초 접속 지연과 인터넷 환경별 지연을 없앤다는 보장은 하지 않는다.
