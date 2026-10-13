# 온라인 방 운영

공개 사이트 `minogame.site`의 방 기능은 Supabase 프로젝트 `spider`
(`zzencpfytpdbjmqvtquc`)를 사용합니다. 정적 Vercel 배포에는 별도 Node WebSocket
서버가 필요하지 않습니다. 로컬 Vite 개발 서버는 기본적으로 기존 `/ws` 서버를
사용하고, 프로덕션 빌드는 Supabase를 사용합니다. `VITE_WS_URL`을 설정하면
기존 WebSocket 서버가 우선합니다.

Supabase 대시보드에서 **Authentication → Sign In / Providers → Anonymous Sign-Ins**를
켜야 게스트가 계정 입력 없이 방을 만들고 참가할 수 있습니다. 공개 키는
`src/SupabaseRooms.js`에 있으며 비밀 키가 아닙니다. `service_role` 또는
`sb_secret_` 키를 브라우저 코드나 Vercel 환경 변수에 넣지 마세요.

방 생성, 준비, 시작, 이동, 공격 판정은
`supabase/migrations/20261012112117_game_rooms_realtime.sql`의 RPC 함수가
처리합니다. 테이블은 RLS와 권한 제한으로 직접 읽거나 수정할 수 없습니다.
방마다 비공개 Realtime Broadcast 채널을 사용합니다. 참가자가 닫힌 탭에서
떠나는 요청을 보내지 못하면 마지막 활동 후 120초가 지나 다음 방 요청 때
정리됩니다. 방 목록은 5초마다 갱신됩니다.

`supabase/migrations/20261012140000_game_move_pose.sql`은 기존 이동 검증을
통과한 업데이트의 모션·속도·손별 거미줄·벽 자세를 같은 방에 전달합니다.
서버의 인증 ID를 사용하며, 체력과 공격 판정은 기존 서버 규칙을 유지합니다.
이 마이그레이션은 운영 `spider` 프로젝트에 적용하고 검증했습니다.

브라우저 탭마다 별도의 인증 저장 키를 사용합니다. 같은 브라우저의 두 탭도
독립된 플레이어로 참가할 수 있고, 새로고침은 그 탭의 로그인과 방을 복구합니다.
복제 탭은 브라우저의 세션 저장소 복사 방식에 따라 같은 플레이어가 될 수 있으므로
2인 검증에서는 새 탭을 각각 여세요. 재접속 시 인증 클라이언트를 재사용합니다.

배포 전에 실제 Supabase 통합 점검을 실행합니다:

```sh
SUPABASE_URL=https://zzencpfytpdbjmqvtquc.supabase.co \
SUPABASE_PUBLISHABLE_KEY=<publishable-key> \
node scripts/check-supabase-rooms.mjs
```

Vercel은 GitHub `main`에 푸시하면 자동 배포됩니다. 배포 후 두 개의 독립된
브라우저 프로필 또는 별도로 연 탭에서 방 생성, 코드 참가, 준비, 시작, 이동을 확인합니다.

## 플레이 경험 확장 — 2026-10-13

`20261012234718_gameplay_experience.sql`과 `20261012235525_arena_correction.sql`을
연결된 프로젝트에 적용했습니다. enhanced 추격전의 안전 지형 준비, 인원별 경기 시간,
이동 목표, 팀원 구조, 위치 단서, 역할 순환과 경계 보정이 game_command에 포함됩니다.
로컬 도시 충돌체와 임시 피격 확인은 private game 스키마에 보관합니다.
홍콩 공격은 피격자에게 지형 확인을 요청하며 다른 참가자의 확인으로 피해를 확정할 수 없습니다.
이는 홍콩 전체 지형을 서버에서 시뮬레이션하는 방식은 아닙니다.

추가 통합 점검은 `npm run test:upgrade:supabase`로 실행합니다. 임시 방을 만들고
검사 후 나가며, 상세 결과는 `docs/qa/game-upgrade-2026-10-13/REPORT.md`에 있습니다.
