# itch.io 배포 패키지 검수

## 통과
- 전용 itch 모드 빌드 성공. 기존 일반 사이트 dist와 설정은 별도 유지.
- ZIP 루트 index.html, 파일 98개, 해제 195,032,661 bytes, ZIP 72,485,998 bytes.
- itch.io 문서의 1000개/500MB/개별 200MB/경로 240자 제한 내. ZIP CRC 및 모든 파일 SHA-256 일치 확인.
- 빌드 HTML에 루트 기준 src/href 없음. 런타임 models/motions/textures/basis 경로를 상대 경로로 변환.
- 실제 Chrome에서 중첩 경로 /uploads/123456/game/index.html을 교차 출처 iframe에 넣고 sandbox allow-scripts allow-same-origin allow-pointer-lock 환경에서 실행.
- 로컬 도시: 캐릭터·모션 준비, 혼자 플레이, WASD 이동과 Space 점프, H 도움말 열기·닫기 확인.
- 홍콩: 외부 HTTPS 지도 프록시로 LIVE 상태 및 혼자 플레이 진입 확인.
- Supabase 온라인 연결 후 '온라인 · 방을 선택하세요' 표시 확인. 사용자 설정 모드 UI 제외 확인.
- 첫 두 지도 검수 시 로컬 HTTP 요청 90개 모두 200. 이후 요청은 requests.jsonl 참조.
- 홍콩 실행 시 브라우저 error 로그 없음. 확장 프로그램 자체의 listener 경고는 게임 오류와 구분.
- 커버 1408×1117, 배너 2172×724; 제목과 캐릭터·구도 시각 확인.
- 갤러리는 실제 게임 캡처 3장. 모션 검증 도구의 테스트 장면은 갤러리에서 제외.

## 남은 실제 환경 검수
실제 itch.io CDN 업로드·공개, 해당 출처의 전체화면·pointer lock·저장소 정책, 실제 2~8인 인터넷 경기, 모바일 실기기 성능은 이번 패키지 작업의 통과 범위가 아닙니다. 업로드 후 UPLOAD_GUIDE_KO.md 순서로 확인하세요. 이전 게임 전체 검수 기록은 docs/qa/expert-2026-10-22/REPORT.md입니다.

Vite는 약 5.71MB JS 청크에 대해 크기 경고를 출력합니다. 빌드 실패는 아니며 초기 네트워크·파싱 비용은 남아 있습니다. 모델·모션 재배포 권리는 RELEASE_CHECKLIST.md의 미확인 항목을 확인해야 합니다.

ZIP SHA-256: 644c8996e79105c593c5a48dfc7482154984ac15d2662eeee50a47b16508f232

공식 제한 참고: https://itch.io/docs/creators/html5
