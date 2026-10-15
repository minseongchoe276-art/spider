# 공개 사이트 접속 복구 — 2026-10-14

## 원인

사용자가 확인한 주소는 `https://minogame.site/`였다. HTML과 게임 JS는 HTTP 200이지만, 기본 홍콩 모드가 요청하는 `/urban-tiles/api/3d-data/...` 경로는 Vercel에서 HTTP 404였다. 브라우저는 로딩 화면에 지도 파일 404를 표시했다. 로컬 Vite와 Node 서버에는 이 프록시가 있어 절차 생성 도시 또는 로컬 실행만 가능해 보였다.

## 수정과 공개 반영

`vercel.json`을 추가해 공식 홍콩 지도 서버의 `/api/3d-data/` 경로만 같은 출처의 `/urban-tiles/api/3d-data/`로 전달하도록 했다. 공개 지도 응답은 CDN에서 5분 캐시하고 `nosniff`를 적용한다. 경로 밖의 `/urban-tiles/not-allowed`는 여전히 HTTP 404다.

기존 공개 커밋을 기준으로 이 설정 파일 하나만 수정했다. 커밋 `11cf21921348326975e590dd7614ac881a34ecb8`을 main에 반영했고 Vercel의 자동 공개 배포가 성공했다. 다른 진행 중인 게임 변경은 이 배포에 포함하지 않았다.

배포: https://vercel.com/ms-projects14/spider/56iFroAnkDWMeqFDxZqBqeHeqfgG

## 확인

- 게임이 사용하는 지도 루트 3개와 실제 중첩 지도 JSON 1개: HTTP 200, 올바른 root/JSON 확인 (`http-checks.json`).
- 공개 주소를 새로 불러온 Chrome: 홍콩 지도 1/3 로딩을 거쳐 LIVE 준비 상태, 로딩 오류 화면 해제 확인.
- 실제 공개 사이트에서 혼자 플레이를 누르고 W 이동: 캐릭터와 지도 표시, 위치가 북쪽 0m에서 2m로 이동, 고도 20m 확인.
- 배포 후 조회한 error 로그 표본: 빈 배열. 배포 전 동일 탭에 남은 404 기록과 구분했다.
- 정상 실행 화면: `public-hong-kong-working.jpg`.

공식 [Vercel 외부 rewrite 문서](https://vercel.com/docs/routing/rewrites)에 따라 정적 배포의 프록시 경로를 구성했다. 앱 코드나 지도 제공 서버를 변경하지 않았다.

별도 진단 중 www.minogame.site의 만료된 인증서도 확인했지만, 사용자가 지목한 주소는 www 없는 minogame.site였으며 이번 수정 대상은 실제 홍콩 지도 404였다.
