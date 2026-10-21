# 손발 모션 자연스러움 재검토 — 최종 검증 2026-10-21

전체 33개 모션의 손목·손가락·발 방향·접지·무릎 방향을 재검토하고, 재현된 세 문제를 수정했다.

- 복싱 대기의 뒤쪽 지지 발이 상대 방향에서 112.3° 돌아가던 문제: 지지 발 목표 방향을 제한하고 뒷발 디딤 위치를 10cm 앞당겨 긴 다리 자세에 의한 바깥쪽 기울어짐까지 줄였다. 7개 복싱 클립의 지지 발 최대 방향 이탈은 65.61°다. 손목 12°·발목 18°·발가락 5° 제한과 회전 속도 제한은 유지했다.
- 오른쪽 훅의 주먹 레이어 누락: 다른 타격과 같은 양손 주먹을 적용했다.
- 절대 손 모양 레이어의 원본 자세 복원 누락: 주먹·벽 접촉 자세를 다음 믹서 샘플 전에 복원한다. 같은 샘플이 유지될 때 손가락 모양이 다음 동작에 남지 않는다.

[수정 전 검사](before-expression.json)는 세 문제에서 실패했고, [수정 후 검사](after-expression.json)는 네 항목을 통과했다. 공중 보행 발의 무릎 방향 검사는 전후 모두 통과했고, 근거 없이 해당 관절을 추가 변경하지 않았다. 발 방향만 바꾼 중간 구현에서 훅의 발바닥 기울기 검사가 실패해, 디딤 위치까지 함께 수정한 뒤 기존 기준 그대로 재검사했다.

프로덕션 빌드와 최종 **45개 검사 모두 통과**했다. 초기 외형 검사 3개는 분리한 검증 폴더에 원본 `artifacts/` 연결이 없어 ENOENT로 시작하지 못했다. 원본 파일 연결을 보완하고 소스 변경 없이 재실행해 모두 통과했다. 원래 시도와 재실행 로그를 함께 보존한다.

## 검증 범위와 재현

최종 검증은 기준 커밋 2d05a78에 이번 변경을 스테이징한 모든 소스·스크립트를 별도 디렉터리에 복사해 수행했다. 작업 공간에 있던 별도의 미커밋 벽 동작·외형 변경은 포함하지 않았다. [최종 검사 목록·결과 — 45/45 통과](index-audit/final-results.json), [소스 변경 감지 및 해시](index-audit/source-integrity.json), [검사 행렬](index-audit/manifest.json)을 보존한다.

```sh
npm run test:motion-expression
MOTION_AUDIT_WORKERS=4 MOTION_AUDIT_DIR=docs/qa/motion-naturalness-2026-10-20/index-audit MOTION_AUDIT_DATE=2026-10-21 node scripts/run-motion-audit.mjs
npm run build
node scripts/export-motion-quality.mjs
```

손발·전환·지상 접지·벽 등반·난간·관절 속도 검사와 이동 중 전투 등을 포함한다. 최근 인간 모드의 공중 거미줄 금지를 반영하지 못한 기존 QA 입력 사례도 실제 모드 전환을 명시하도록 수정했다. 기존 접지·기울기·관절 제한 기준을 완화하지 않았다.

전체 33개 × 두 오프라인 메시 표본으로 66개 타임라인, 7,886프레임과 462개 최종 자세를 다시 생성했다. [전체 재생 검토 페이지](../motion-quality-2026-10-20/review.html)에서 확인할 수 있다. 두 외형은 별도의 메시를 사용하며, 검토 페이지와 게임에서는 Q 전환으로 확인했다. 이번 커밋에서 외형 전환 정책은 변경하지 않았다.

## 시각 검토

두 외형의 33개 모션을 각 7시점, 정면·측면·후면으로 확인했다. 주먹 누락과 뒤쪽 발 방향을 수정한 표본은 [복싱 대기](after/web-combatIdle.png), [오른쪽 훅](after/web-rightHook.png)에 보존했다.

| 묶음 | 정면 | 측면 | 후면 |
|---|---|---|---|
| 1 | [와이어](after/front-1.jpg) / [인간](after/combat-front-1.jpg) | [와이어](after/side-1.jpg) / [인간](after/combat-side-1.jpg) | [와이어](after/back-1.jpg) / [인간](after/combat-back-1.jpg) |
| 2 | [와이어](after/front-2.jpg) / [인간](after/combat-front-2.jpg) | [와이어](after/side-2.jpg) / [인간](after/combat-side-2.jpg) | [와이어](after/back-2.jpg) / [인간](after/combat-back-2.jpg) |
| 3 | [와이어](after/front-3.jpg) / [인간](after/combat-front-3.jpg) | [와이어](after/side-3.jpg) / [인간](after/combat-side-3.jpg) | [와이어](after/back-3.jpg) / [인간](after/combat-back-3.jpg) |
| 4 | [와이어](after/front-4.jpg) / [인간](after/combat-front-4.jpg) | [와이어](after/side-4.jpg) / [인간](after/combat-side-4.jpg) | [와이어](after/back-4.jpg) / [인간](after/combat-back-4.jpg) |
| 5 | [와이어](after/front-5.jpg) / [인간](after/combat-front-5.jpg) | [와이어](after/side-5.jpg) / [인간](after/combat-side-5.jpg) | [와이어](after/back-5.jpg) / [인간](after/combat-back-5.jpg) |
| 6 | [와이어](after/front-6.jpg) / [인간](after/combat-front-6.jpg) | [와이어](after/side-6.jpg) / [인간](after/combat-side-6.jpg) | [와이어](after/back-6.jpg) / [인간](after/combat-back-6.jpg) |
| 7 | [와이어](after/front-7.jpg) / [인간](after/combat-front-7.jpg) | [와이어](after/side-7.jpg) / [인간](after/combat-side-7.jpg) | [와이어](after/back-7.jpg) / [인간](after/combat-back-7.jpg) |
| 8 | [와이어](after/front-8.jpg) / [인간](after/combat-front-8.jpg) | [와이어](after/side-8.jpg) / [인간](after/combat-side-8.jpg) | [와이어](after/back-8.jpg) / [인간](after/combat-back-8.jpg) |
| 9 | [와이어](after/front-9.jpg) / [인간](after/combat-front-9.jpg) | [와이어](after/side-9.jpg) / [인간](after/combat-side-9.jpg) | [와이어](after/back-9.jpg) / [인간](after/combat-back-9.jpg) |

커밋 대상으로 고정한 최종 프로덕션 빌드의 로컬 미리보기에서 실제 키·마우스 입력으로 대기 → B+W 이동 방어 → 잽 → 훅 → 스트레이트 → G 강한 타격 → 질주 → 점프 → Q 모드 전환을 수행했다. 내부 상태·좌표·관절을 강제로 설정하지 않았다. [이동 방어](after/game-moving-guard.png), [훅](after/game-hook.png), [스트레이트](after/game-cross.png), [강한 타격](after/game-special.png), [점프](after/game-jump.png), [모드 전환 후](after/game-mode-release.png)를 보존했다.

배포 게임의 벽 → 난간 → 옥상 직접 입력 검증은 [앞선 배포 검증 기록](../production-wall-ledge-2026-10-20/README.md)에 있다. 이번 수정 빌드의 모든 지형·모든 입력 조합을 배포 환경에서 다시 검증했다는 의미는 아니다. 유한한 검사와 시각 표본의 통과가 모든 모션의 예술적 완벽함을 보증하지는 않는다.

## 배포 반영 후 직접 확인

수정 커밋 `e479084`를 main에 푸시한 뒤 `https://minogame.site/?city=procedural`의 번들이 `index-CDLQhRr0.js`에서 `index-07eE3od0.js`로 교체된 것을 확인했다. 공개 번들에서 원본 손 복원·오른쪽 훅 주먹·복싱 지지 발 보정의 세 코드 패턴을 확인하고 [번들 해시와 확인 결과](production-check.json)를 보존했다. Render MCP는 선택된 workspace가 없어 관리 API의 배포 상태 대신 공개 페이지와 게임 자체로 검증했다.

새 배포에서 실제 키·마우스로 Q 인간 전투 모드 → B+W 이동 방어 → 좌클릭 잽 → E 훅 → 우클릭 스트레이트 → G 강한 타격 → Shift+W 질주 → Space 점프 → Q 와이어 모드 전환을 실행했다. 이 입력 경로의 화면 표본에서는 새 손발 뒤집힘이나 비정상적인 늘어남을 발견하지 못했다. 마지막 [HUD 기록](production/hud.txt)은 로컬 도시 고도 95m, PULSE READY다. [대기](production/idle.png), [이동 방어](production/moving-guard.png), [훅](production/hook.png), [스트레이트](production/cross.png), [강한 타격](production/special.png), [점프](production/jump.png), [모드 전환](production/mode-release.png)를 보존했다.
