# 공개 전 확인 기록

## 현재 준비 상태
게임 ZIP과 소개·조작표·이미지는 준비되었습니다. 계정 생성, itch.io 업로드와 공개는 수행하지 않았습니다.

## 에셋 출처·배포 권한
기술 검수는 재배포 권한의 확인을 대신하지 않습니다. 아래 미확인 항목은 소유자의 원본 구매·생성·이용 약관 자료로 확인해야 합니다. 새로 동의나 법률 판단을 대신하지 않았습니다.

| 항목 | 로컬 증거 / 필요한 확인 |
|---|---|
| 기본 외형 및 리그 | public/models/appearance-web.glb, shadow-pulse-rig.glb. 외형 원본은 artifacts에 있으나 상업 이용·브라우저 파일 공개를 허용하는 생성/구매 기록은 이번 작업에서 확인하지 못함 |
| FBX 모션 및 파생 JSON | public/models/*.fbx, public/motions/*.json. 취득 경로와 게임 내 포함·원본 파일 재배포 조건 확인 필요. ZIP에는 런타임 복구용 FBX도 포함됨 |
| 추가 전투 모션 | public/models/sources/LICENSE-CC0.md에 CC0 문서 보존. 이 문서가 모든 다른 모델·모션의 권리까지 증명하지는 않음 |
| VFX | public/textures/vfx/LICENSE.txt에 보존된 라이선스와 원본 출처 확인 |
| 홍콩 도시 데이터 | 홍콩 Lands Department 외부 스트리밍. 데이터 이용 조건·필수 크레딧과 실제 화면 표시 확인. 데이터 자체를 ZIP에 복제하지 않음 |
| 폰트 | Google Fonts에서 Outfit / Noto Sans KR을 외부 로딩. 소프트웨어·폰트 공지 요구 확인 |
| 엔진·라이브러리 | Three.js, Rapier, Supabase JS, 3d-tiles-renderer, fflate 등의 배포 라이선스/NOTICE는 THIRD_PARTY_NOTICES.txt 참고 |
| 게임명 SHADOW PULSE | 공개 사용 가능 여부·기존 상표 등은 별도 확인 필요 |
| 커버·배너 | 내장 imagegen 도구로 새로 생성. AI 홍보 일러스트임을 소개문에 명시. PROMPTS.md에 제작 지시 보존 |

## 외부 서비스 및 개인정보 안내 작성 시 참고
- itch.io용 온라인은 기존 Supabase 프로젝트의 익명 인증·Realtime·RPC를 사용합니다. 공개 브라우저 키만 포함하며 서비스 관리자 키는 포함하지 않습니다.
- 온라인 이름, 방 상태와 플레이 데이터가 해당 서비스로 전송됩니다. 공개 시 운영자 정보·문의 경로와 실제 데이터 처리 방침을 확인해 공지하세요. 확인되지 않은 개인정보 보장 문구는 소개에 넣지 않았습니다.
- 홍콩 도시는 https://minogame.site/urban-tiles 를 거쳐 공식 3D 데이터를 받습니다. 해당 서비스·업스트림 CORS·가용성에 의존합니다. 로컬 도시는 이 지도 서비스 없이 플레이할 수 있습니다.
- Google Fonts 및 지도 화면의 외부 지도 서비스에도 네트워크 요청이 발생합니다. 완전 오프라인 패키지가 아닙니다.
- 사용자 설정 팀전·개인전은 전용 WebSocket 서버의 출처 허용 설정이 필요하므로 itch.io 빌드 UI에서 제외했습니다. 일반 웹사이트 빌드에는 영향이 없습니다.
- 실제 인터넷 8인 동시 경기, 모바일 실기기, 실제 itch.io CDN·저장소 정책까지 통과했다고 표시하지 않았습니다.
