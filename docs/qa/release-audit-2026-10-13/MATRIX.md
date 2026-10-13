# 요구사항별 검증 매트릭스

2026-10-13. `자동/검토`는 소켓·컴포넌트·정량 검사 및 명시된 소스/권한 검토다. `브라우저`는 실제 UI 입력 결과다. 자동 PASS가 브라우저 미검증 항목까지 통과시킨다는 의미는 아니다. `NOT TESTED`는 미수행, `N/A`는 해당 없음이다. 운영 쓰기 통합은 staging 부재로 BLOCKED이며 아래 운영 행의 실제 공격/플레이는 NOT TESTED로 기록한다.

증거 파일은 모두 [evidence/](evidence/)에 있다. 기존 테스트 파일은 저장소 scripts/에 있다.

| ID | 요구사항 | 시스템/방법 | 자동/검토 | 브라우저 | 증거 | 범위·한계 |
|---|---|---|---|---|---|---|
| ENV-01 | 실제 실행 대상·소스 식별 | package.json / manifest | PASS | PASS | final-source-manifest.json | 루트 게임; 하위 샘플 제외 |
| ENV-02 | 의존성·모션 데이터 | npm audit / check-motions | PASS | N/A | dependency-audit.json / final-test.log | 39개 manifest; 의존성 보고 취약점 0 |
| FLOW-01 | 로비·혼자 플레이·지도 로딩 | main / Multiplayer / City | PASS | PASS | procedural-solo.png / hong-kong-solo.json | 두 지도 |
| FLOW-02 | 일시정지·계속·레이스 시간 | main / TimeTrial | PASS | PASS | pause-race.json | 약 52.5초 동안 시간 유지 |
| FLOW-03 | 시작점·로비 복귀 | main / Multiplayer | PASS | PASS | pause-race.png / browser-checks.json | 실제 메뉴 클릭 |
| FLOW-04 | 도움말·입력 차단 | main / input regressions | PASS | PASS | help.png / final-test.log | 도움말 표시 확인; 조합 전체 미검증 |
| FLOW-05 | 저장 차단·손상 설정 | Preferences / Progression | PASS | NOT TESTED | final-test.log / new-regressions-after.json | 자동 모의 storage; 실제 브라우저 차단 미주입 |
| FLOW-06 | 포커스·가시성·버튼 해제 | main / check-qa | PASS | NOT TESTED | final-test.log | 실제 운영체제 포커스 조합 미검증 |
| FLOW-07 | WebGL 손실·복구 | main handlers | NOT TESTED | NOT TESTED | 소스 검토 | 핸들러 존재를 복구 통과로 표시하지 않음 |
| INPUT-01 | 키 재지정·HUD 반영 | SettingsPanel / PlayerSettings | PASS | PASS | keyboard-remap.json | W→K→W; 입력 모의 검사도 수행 |
| INPUT-02 | 포인터 잠금 없이 플레이 | main / Camera | PASS | PASS | pause-race.png / browser-checks.json | 잠금 거부 자체의 실환경 시험은 미수행 |
| INPUT-03 | 게임패드 | GamepadInput | PASS | NOT TESTED | final-test.log | 정규화/입력 경로 검사; 물리 패드 없음 |
| MOVE-01 | 카메라 기준 이동·점프 | SwingPhysics / controller | PASS | PASS | combat-inputs.json / dual-web-confirmed.json | 실제 W와 Space; 모든 방향 조합은 자동 |
| MOVE-02 | 양손 줄·고정 길이 | WebConstraints / SwingPhysics | PASS | PASS | dual-web-confirmed.json | 독립 anchor 2개 확인 |
| MOVE-03 | 독립 해제·재부착·관성·에너지 | pendulum / dual-web | PASS | NOT TESTED | final-test.log / soak-summary.json | 자동 수치 검사; 모든 해제 조합 브라우저 미검증 |
| MOVE-04 | E 집·장애물·1회 제한 | SwingPhysics | PASS | NOT TESTED | final-test.log | 실제 성공 집 전체 흐름 미확인 |
| MOVE-05 | 벽 이동·벽 점프·옥상 진입 | LedgeTraversal / traversal | PASS | NOT TESTED | final-test.log | 지지·천장·중단·착지 자동 검사 |
| MOVE-06 | 경사·계단·캡슐·빠른 충돌 | MovementCollision / StreamedCollision | PASS | NOT TESTED | final-test.log | 홍콩 지면 접촉 관측과 빠른 충돌 완주를 구분 |
| MOVE-07 | 낮은/높은 FPS의 동일 물리 | controller / pose / pendulum | PASS | NOT TESTED | final-test.log | 30/60/144fps 수치·실물 리그 검사 |
| MOVE-08 | 구역 경계·복구 | PlayerExperience / PursuitRules | PASS | NOT TESTED | final-test.log | 소켓 correction 및 지역 경계 자동 |
| ANIM-01 | 원본·컴파일·리타게팅 | build-motions / pose / timeline | PASS | PASS | final-test.log / motions/samples.json / transitions/samples.json | 39개 45% 자세·12개 연결 표본; 전체 영상 평가는 미수행 |
| ANIM-02 | 점프·스윙·착지·전투 전환 | Character / Combat | PASS | PASS | dual-web-confirmed.json / combat-inputs.json | 샘플 전환 관측; 완전한 주관적 판정 아님 |
| ANIM-03 | 발·골반·관절 안정성 | check-pose / check-combat-rig | PASS | PASS | final-test.log / hong-kong-solo.json | 자동 정량 검사+지면 샘플 |
| ANIM-04 | 공중 묘기 완주·연속 보상 | AirTricks / StuntSystem | PASS | NOT TESTED | final-test.log | 기본 묘기와 추가 착지 연결 보상을 구분 |
| CAM-01 | 카메라 벽 가림·시점·줌 | Camera / QA regressions | PASS | PASS | final-test.log / camera-modes.json / camera-mode-0.png~3.png | 4시점과 C 입력 관측; 모든 벽 배치는 자동 |
| CAM-02 | 효과 줄이기·품질 저장 | main / Preferences | PASS | PASS | hong-kong-high-performance.json / 후속 품질 증거 | 메뉴 값과 새로고침 확인 |
| UI-01 | HUD·미니맵·로비 배치 | style / Minimap | PASS | PASS | procedural-solo.png / hong-kong-ready.png | 1280×720 및 800×600·1024×768 HUD 표본; responsive-checks.json |
| UI-02 | 잘못된 방 코드 오류 표시 | style / actual invalid join | N/A | PASS | lobby-error-before.json / lobby-error-after.json·png | z-index 45→80; 로비 위 표시 |
| COMBAT-01 | 공격·방어·회피·재사용·기력 | Combat / choreography | PASS | PASS | combat-inputs.json / final-test.log | 실제 공격 입력; 모든 방어 타이밍은 자동 |
| COMBAT-02 | 개인 연습·방패·투사체·패배 | CombatPractice / upgrade | PASS | PASS | practice-after.json / practice-defeat-before.json | 패배 메시지는 회귀 수치 검사로 재검증 |
| RACE-01 | 링 순서·빠른 통과·기록 키 | TimeTrial / RaceGhost | PASS | NOT TESTED | final-test.log | 실제 브라우저 완주는 미수행 |
| RACE-02 | 레이스 시작·종료·활성 시간 | main / TimeTrial | PASS | PASS | pause-race.json / help.png | 일시정지 시간 확인 |
| MAP-01 | 홍콩 타일·텍스처·실제 충돌 | UrbanGroundCity / TileTextures | PASS | PASS | hong-kong-final-swing.json | ready·RGB 해독·collision 확인 |
| MAP-02 | LOD 소실·큰 타일·콜라이더 수명 | StreamedCollision / check-qa | PASS | NOT TESTED | final-test.log | 네트워크 장애와 고속 장거리 실제 재현 미수행 |
| MAP-03 | 실패·타임아웃·복구 안내 | AssetLoader / City | PASS | NOT TESTED | final-test.log | 자동 실패 주입; 브라우저 망 손실 미주입 |
| HTTP-01 | 프로덕션 HTTP·프록시 | scripts/serve | PASS | N/A | final-server-checks.json | 10개; 쓰기/숨김/인코딩 경로/HEAD/타일 |
| ONLINE-01 | 독립 2인 참가·준비·시작 | Multiplayer / rooms | PASS | PASS | two-player-peer.json / browser-checks.json | 로컬 WebSocket |
| ONLINE-02 | 정원·방장 권한·7/8명 역할 | MatchRules / rooms | PASS | NOT TESTED | final-test.log | 7인 역할과 8연결은 자동; 실제 8인 아님 |
| ONLINE-03 | 모션·줄·보간·정리 | RemoteMotion | PASS | PASS | two-player-remote-motion.json | 원격 SWINGING/swing/web:true |
| ONLINE-04 | 새로고침·복귀·역할 유지 | rooms resume / Multiplayer | PASS | PASS | browser-reconnect.json | 최종 playing:true와 인원 2 확인 |
| ONLINE-05 | 경기 시간·전원 탈락·종료 | MatchRules / rooms | PASS | PASS | two-player-expiry-dom.txt / new-regressions-after.json | 실제 시간 종료; 전원 탈락 소켓 검사 |
| ONLINE-06 | 재경기·역할 순환·퇴장 | rooms / Multiplayer | PASS | PASS | two-player-rematch-dom.txt / final-test.log | 역할 순환은 소켓 자동 |
| ONLINE-07 | 피해 수치·팀 제한·보호·관전 | MatchRules / multiplayer | PASS | PASS | runner-mode-lock.txt / final-test.log | 실제 Q 제한; 관전 전체는 자동/소스 |
| ONLINE-08 | 목표 탈출·동료 구조 | PursuitRules / upgrade-online | PASS | NOT TESTED | final-test.log | 목표 3개·근처 3초→HP50 소켓 검사 |
| ONLINE-09 | 자유 플레이 피해·시간 없음 | rooms / MatchRules | PASS | NOT TESTED | final-test.log | 실제 2인 자유 탐험 장시간 미수행 |
| SEC-01 | 홍콩 피해자 신뢰 경계 | rooms / Supabase RPC | FAIL | NOT TESTED | hong-kong-defender-trust.json | P1; 로컬 악성 소켓 재현; 운영은 읽기 검토 |
| SEC-02 | 운영 Supabase 반복 이동 여유 | game_command | FAIL | NOT TESTED | supabase-final-trust-review.json / movement-budget-before.json | P1; 운영 공격·수정 미수행; proposal 산식만 검토, staging BLOCKED |
| SEC-03 | 로컬 누적 이동 예산 | rooms | PASS | NOT TESTED | new-regressions-after.json | 순간이동 거부와 정상 지연 수용 |
| SEC-04 | 메시지 크기·반복 요청 | rooms transport | PASS | N/A | new-regressions-after.json | 4KiB 수신 한도; 큰 메시지 연결 종료 |
| SEC-05 | RLS·스키마·RPC 인증 경계 | Supabase grants / policies | PASS | NOT TESTED | supabase-permissions.json / supabase-schema.json | 실제 읽기 권한·소스 검사; 운영 비인가 공격 미실행 |
| SEC-06 | 다른 방 접근·클라이언트 위조 | RPC / MatchRules | PASS | NOT TESTED | final-test.log / supabase-schema.json | 로컬 역할/피해 위조 일부; 전체 보안 감사 아님 |
| PERF-01 | 홍콩 수정 전 프레임 예산 | browser active frame samples | FAIL | FAIL | hong-kong-high-performance.json / hong-kong-profile-before.json | 수정 전 기준 약 20~22FPS; 카메라 병목 재현 |
| PERF-02 | 홍콩 카메라 병목 개선 | UrbanGroundCity / Camera callers | PASS | PASS | hong-kong-profile-after.json / new-regressions-after.json | 59.95FPS; 카메라 34.14→0.047ms; LOD·원거리 fallback 검사 |
| PERF-03 | 30분 서버·물리·8연결 | soak-release-audit | PASS | N/A | soak-summary.json | 최종 이동 예산/카메라 수정 전 스냅샷 |
| PERF-04 | 최종 서버 60초·8연결 | soak-release-audit | PASS | N/A | final-server-soak-60s.log | 최종 이동 예산 포함 |
| PERF-05 | 홍콩 브라우저 30분 활성 유지 | actual browser soak | PASS | PASS | hong-kong-browser-soak.json | 46.19분; 긴 대기+주기적 입력; 연속 순회/8인 아님; 검증기/CSS 마지막 변경 전 |
| COMPAT-01 | Safari/Firefox·여러 GPU | native browsers / hardware | NOT TESTED | NOT TESTED | 없음 | 현재 내장 브라우저만 |
| COMPAT-02 | 터치·모바일 입력 | 미구현 터치 | N/A | N/A | README / source | 신규 구현을 검증 범위에 추가하지 않음 |
| LEGAL-01 | 모델·모션·지도·명칭 배포 권한 | asset licenses | NOT TESTED | N/A | 기존 README 주의 | 권리자의 실제 승인 문서 확인 필요 |
