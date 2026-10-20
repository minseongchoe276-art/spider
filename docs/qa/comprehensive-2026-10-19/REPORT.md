# SHADOW PULSE 전체 분야 검수 — 2026-10-19

**최종 결과: 통합 74/74 통과, 실행 중 소스·에셋 변경 0개.** 실제 브라우저 통합 14/14, 프로덕션 HTTP 10/10, 두 외형의 전체 스킨 포즈 858개, 난수 물리 5,000개가 통과했다. 반복 전투 발 접지는 연속 45개 + 고정 자세 75개 사례가 통과했다. 프로덕션 빌드도 성공했다.

사용자가 선택한 **지상 자동 도약 및 바닥 스침 재도약 유지** 규칙을 최종 기준으로 사용했다.

최종 실행 수치와 소스 일치 여부는 `results.json`, `source-snapshot.json`을 기준으로 판정한다. 이 문서는 검사 범위와 수정 근거를 설명하며, 모든 미래 입력·기기·지형에서 오류가 없다는 보증은 아니다.

## 발견과 수정

| 문제 | 재현 조건과 수정 | 근거 |
|---|---|---|
| 경사로 출구의 잘못된 접지 상태 | 부츠가 서로 다른 높이의 지형에 걸쳐 있을 때 발바닥 관통 보정으로 발목이 올라가도 이전 발 고정점이 남았다. 접지 획득 구간 이후 실제 발목 높이와 고정점의 차이가 3cm를 넘으면 그 접지를 해제한다. 수평 접지 블렌드는 유지한다. | 기존 `check-pose`의 실제 캡슐+경사로 60 FPS 검사에서 39.3mm 오류로 재현. 수정 후 경사로 30/60/144 FPS 최대 오차 19.1/18.2/17.9mm, 계단 13.9/17.9/14.7mm. `pose-fix-verification.log` |
| 지도 뒤에서 패드 Start가 게임 재개 | 지도·네이티브 대화상자가 열려 있을 때 패드 Start와 시점 입력을 차단한다. 일반 메뉴에서의 Start는 유지한다. | `check-modal-lifecycle.mjs.log` |
| 지도/전체화면 도움말의 오래된 재개 의도 | 창을 연 뒤 포커스 상실이나 강제 정지가 생기면 자동 재개 의도를 취소한다. 지도 닫기에서 숨김 탭·그래픽 손실·로비 상태의 재개 및 포인터 잠금을 막는다. 지도 중복 열기는 무시한다. | `check-modal-lifecycle.mjs.log`, `check-input-lifecycle.mjs.log`, `check-display-mode.mjs.log` |
| 투사체의 앞뒤 충돌 순서 | 한 프레임의 이동 선분이 플레이어를 먼저 통과하고 벽에 닿으면 뒤쪽 벽 때문에 피해가 취소됐다. 구체 진입 거리와 벽의 거리를 비교해 먼저 만난 대상을 적용한다. 동률은 벽을 우선한다. | `check-audit-edge-cases.mjs.log`의 벽 없음/앞쪽 벽/뒤쪽 벽/동률 4개 사례 |
| 온라인 모션의 비정상 경계 데이터 | 같은 손의 두 줄을 하나로 제한하고 벽/난간 법선을 정규화한다. 길이 0의 법선 및 지나치게 큰 난간 높이는 사용하지 않는다. | `check-audit-edge-cases.mjs.log`, `check-remote-motion.mjs.log`, `check-multiplayer.mjs.log` |
| 실제 조작과 문서의 모순 | M은 전체 지도, 우클릭은 스트레이트, G는 강한 스트레이트로 일치시켰다. 현재 제거된 레이스·1인칭·점수 해제와 터치 미지원 설명을 수정하고 과거 문서의 시점을 표시했다. 검수 외형 선택도 모드명으로 표기했다. | `README.md`, `index.html`, `src/MotionAuditReview.js`, `browser-help.png` |
| 기본 모드가 잘못된 공중 공격 검사 | 테스트가 기본 와이어 모드에서 전투 슬램의 성공을 기대했다. 와이어 모드 거부와 전투 모드 성공을 모두 검사하도록 준비 조건을 수정했다. | `check-upgrade.mjs.log` |
| 온라인 흐름 검사의 외부 지형 의존 | 방/목표/구조 검사가 실제 외부 지형 응답에 영향을 받았다. 흐름 검사는 격리된 명시적 CLEAR/BLOCKED 지형 판정으로 실행하고, BLOCKED에서는 피해가 없는지도 검사한다. 공식 지형 검사는 별도 검사로 유지한다. | `check-upgrade-online.mjs.log`, `check-hong-kong-terrain.mjs.log` |
| 와이어 물리 규칙의 동시 변경 | 검수 중 반영된 자동 도약 복원 변경을 보존한다. 현재 동작 설명과 발사/바닥 접촉/점프 모션 검사를 같은 기준으로 맞춘다. 기본 줄 제약의 에너지 비증가와 게임 규칙에 의한 도약 힘은 구분한다. | `check-reticle-only`, `check-physics-invariants`, `check-web-continuity`, `check-expert-audit`, `check-input-lifecycle` |
| 첫 실패가 나머지 분야를 가림 | 74개 묶음이 실패 후에도 끝까지 실행되는 통합 명령을 추가했다. 각 로그·종료 코드·시간과 소스/모델/모션/서버 코드 해시를 기록한다. | `scripts/check-comprehensive-audit.mjs`, `npm run test:comprehensive` |

초기 전체 검사는 경사로에서 중단됐고, 첫 확장 실행은 수정 중인 소스 기준 68/73 통과였다. 이 실행은 `initial-results.json`, `initial-source-snapshot.json`에 보존했으며 최종 통과 증거로 사용하지 않는다. 다음 실행은 73/74 통과였으나 반복 전투 검사에 300초 제한이 걸렸고 `src/Character.js`의 동시 변경이 감지되어 최종 증거로 인정하지 않았다. 해당 실행은 `iteration-2/`에 보존했다. 그 뒤 와이어 자동 도약 복원 커밋이 같은 작업 폴더에 반영되며 기존 자동 도약 금지 검사와 충돌한 실행은 `iteration-3/`에 별도 보존했다. 최종 규칙은 자동 도약을 유지하며, 도약 중 점프 모션·조준 실패·Space 해제를 검사한다. 무거운 스킨 검사의 제한을 900초로 늘려 같은 74개를 현재 소스로 재검사했고 전부 통과했다. 검수 중 반영된 최종 발목 회전 캐시 동기화 변경도 보존해 같은 소스로 검증했다. 테스트 허용 오차를 올리거나 실패 검사를 제외하지 않았다.

## 분야별 검사 범위

| 분야 | 실행 근거 |
|---|---|
| 에셋·로딩·오프라인 대체·실패 복구 | `check-motions`, `check-motion-sources`, `check-qa`, `check-loading-performance` |
| 캐릭터·실제 캡슐·경사·계단·접지 | `check-pose`, `check-physics-invariants`, `check-silk-gait`, `check-combat-feet` |
| 걷기·질주·점프·낙하·착지·회전·복귀 | `check-controller`, `check-gameplay`, `check-traversal`, `check-mechanics-audit` |
| 양손 와이어·진자·끊김·집·경로 차폐 | `check-dual-web`, `check-pendulum`, `check-web-continuity`, `check-reticle-only`, `check-player-audit` |
| 벽 기어가기·난간·옥상·낮은 발판 | `check-wall-crawl`, `check-wall-ledge`, `check-wall-ledge-rig`, `check-mantle-balcony` |
| 모든 활성 모션·전환·실제 뼈대 | `check-all-motions`, `check-motion-timeline`, `check-motion-transitions`, `check-motion-cleanup` |
| 두 외형·전체 스킨·이동 중 공격 | `check-appearances`, `check-full-appearance-motions`, `check-moving-combat-skin`, `check-combat-traversal` |
| 전투·방어·회피·기력·피격·표적·투사체 | `check-combat`, `check-combat-rig`, `check-combat-quality`, `check-combat-aim`, `check-expert-audit`, `check-audit-edge-cases` |
| 공중 묘기·와이어 상호 배제·중단·완료 | `check-air-tricks`, `check-combat-traversal`, `check-all-motions` |
| 카메라·조준·벽 충돌·세 가지 3인칭 | `check-camera-motion-web`, `check-third-person-only`, `check-reticle-only` |
| 키보드·마우스·패드·터치·포커스 | `check-input-lifecycle`, `check-touch-controls`, `check-session-flow`, `check-modal-lifecycle` |
| 전체화면·세로/가로·도움말·메뉴·지도 | `check-display-mode`, `check-minimap`, `check-compact-map-and-locators`, 실제 브라우저 화면 |
| 저장·차단된 저장소·구버전·안전 위치 | `check-upgrade`, `check-race-removal`, `check-full-game-audit`, `check-session-flow` |
| 온라인 모션·방 입장·재접속·늦은 응답 | `check-remote-motion`, `check-remote-appearance`, `check-room-entry`, `check-room-reconnect`, `check-connection-lifecycle` |
| 2~8인 경기·피해·목표·구조·권한 | `check-multiplayer`, `check-upgrade-online`, `check-online-edge-cases`, `check-postgres-rules`, `check-room-server` |
| 도시 스트리밍·텍스처·서버 지형·공식 홍콩 | `check-hong-kong-streaming`, `check-tile-textures`, `check-city-authority`, `check-hong-kong-terrain`, `check-hong-kong-db-authority` |
| 음향 실패·효과·착지·품질·성능 예산 | `check-qa`, `check-web-vfx`, `check-superhero-landing-vfx`, `check-full-game-audit`, `check-input-lifecycle` |
| 프로덕션 빌드·HTTP·프록시·패키지 취약점 | `build.log`, `http-results.json`, `dependency-audit.json` |

카탈로그의 활성 모션은 33개이며, 전체 외형 검사는 두 외형 × 33개 × 13개 위상 = 858개 전체 스킨 포즈를 검사한다. 소스 클립·파생 클립·사용 중단된 비교용 클립은 구분한다. 모든 모션 간 전환 검사는 별도이며, 정점 검사 통과는 예술적 자연스러움의 무조건적 보증이 아니다.

## 실제 브라우저 확인

- Chrome 로컬 도시에서 로딩 → 혼자 플레이 → 이동·점프·전투 전환을 수행했다.
- 혼합 전투 연습 진입, E/G/B 입력 후 지도 열기/닫기와 도움말 열기/닫기를 확인했다.
- 도움말에서 실제 스트레이트·3인칭·M 지도 안내를 확인했다. `browser-help.png`.
- 390×844 세로와 844×390 가로의 터치 검수 화면에서 이동 스틱·양손 와이어·추가 동작 배치를 확인했다. `browser-mobile-portrait.png`, `browser-mobile-landscape.png`. 검수 후 브라우저 크기는 복원했다.
- 실제 GameApp 루프 통합 검사 14/14가 통과했다. 각 3인칭의 벽/옥상 이동·이동 공격·Space 줄 해제·양손 줄 개별 해제 및 웹/벽 상태에서의 시점 교대가 포함된다. `browser-traversal-results.json`, `browser-traversal.png`.
- 확인한 브라우저 경고는 별도 확장 프로그램의 content script 경고였다. 게임 코드 오류와 구분했다.

## 실행 및 결과 파일

```sh
npm run test:comprehensive
npm run build
PORT=4197 npm start
node scripts/check-server.mjs http://127.0.0.1:4197/
npm audit --omit=dev --json
```

`results.json`은 검사별 결과, `source-snapshot.json`은 실행 전후 SHA-256과 변경 목록이다. 소스가 검사 중 변경되면 검사 자체가 모두 통과해도 해당 실행의 종료 코드는 실패다. 빌드/HTTP는 별도 로그를 함께 확인한다. 추가 난수 물리 검사는 고정 시드 0x51912026으로 가능한 한 줄/두 줄 제약 5,000개를 생성했으며 전부 통과했다. 최대 길이 초과는 부동소수점 오차 수준인 8.53e-14m이고 속도 에너지 증가는 0이었다. 이 결과는 전체 플레이 시뮬레이션을 대신하지 않는다(`physics-fuzz.json`).

운영 의존성의 npm 감사 결과는 알려진 취약점 0개이며, 이는 모든 보안 결함이 없다는 의미는 아니다.

## 남은 실제 환경 검증

운영 Supabase나 공개 사이트에 이번 변경을 배포하지 않았다. PostgreSQL 검사는 격리된 로컬 DB이고, 8인 검사는 로컬 실제 WebSocket 클라이언트다. 공식 홍콩 지형 요청은 실제 읽기 요청으로 검사하지만 운영 다중 지역 지연·실제 기기의 모든 지형 조합까지 증명하지 않는다.

실제 iOS Safari/Android 터치 하드웨어, 물리 게임패드, 다양한 GPU·OS·브라우저, 수시간/수일 연속 플레이, 공개 인터넷 2~8인, 운영 DB의 최신 배포 일치 여부는 별도 현장 검수가 필요하다. 모바일 크기 검수와 모의 입력 검사를 실제 모바일 하드웨어 검수라고 표현하지 않는다.

프로덕션 메인 JS는 약 5.68MB(압축 약 2.03MB)로 Vite의 청크 크기 경고가 남는다. 빌드 실패는 아니지만 느린 회선의 첫 로딩 성능을 추가 측정할 필요가 있다. 원본 캐릭터·모션·지도 에셋의 배포 권한 검증도 이 코드 검사로 대신할 수 없다.

전체 재사용 프롬프트: [PROMPT.md](PROMPT.md). 수정 전 현재 안내 문서: [README-BEFORE.md](README-BEFORE.md).
