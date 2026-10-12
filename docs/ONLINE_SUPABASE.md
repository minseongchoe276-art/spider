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

배포 전에 실제 Supabase 통합 점검을 실행합니다:

```sh
SUPABASE_URL=https://zzencpfytpdbjmqvtquc.supabase.co \
SUPABASE_PUBLISHABLE_KEY=<publishable-key> \
node scripts/check-supabase-rooms.mjs
```

Vercel은 GitHub `main`에 푸시하면 자동 배포됩니다. 배포 후 두 개의 독립된
브라우저 프로필에서 방 생성, 코드 참가, 준비, 시작, 이동을 확인합니다.
