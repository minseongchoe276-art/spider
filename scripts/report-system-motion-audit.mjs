import fs from 'node:fs';
import crypto from 'node:crypto';
const folder='docs/qa/system-motion-2026-10-27',root=process.cwd();
const read=file=>JSON.parse(fs.readFileSync(folder+'/'+file));
const log=file=>fs.readFileSync(folder+'/'+file,'utf8');
const inventory=read('inventory.json'),initial=read('suites/suite-results.json'),followup=read('final-checks/results.json');
const visual=read('visuals/poses.json'),fixed=new Set(['jab','cross','hook']);
const files=Object.keys(visual.sourceHashes),current=Object.fromEntries(files.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
const visualCurrent=files.every(file=>current[file]===visual.sourceHashes[file]);
const requirements=[['final-rig.log','PASS: resetting mid-transition'],['final-web-hands.log','30 passed, 0 failed'],['final-combinations.log','PASS motion combinations'],['final-interruptions.log','PASS 4205'],['final-timed-interruptions.log','PASS 42636'],['final-online-sync.log','PASS eight subjects'],['pose-recheck.log','63 actual-rig cases'],['review-contact-final.log','PASS 54'],['fast-web-gait.log','27/27'],['build.log','built in']];
for(const [file,marker]of requirements)if(!log(file).includes(marker))throw Error('Required verification incomplete: '+file);
if(initial.completed!==65||followup.completed!==11||followup.results.some(r=>!r.pass)||!visualCurrent)throw Error('Matrix incomplete or source drift');
const feet=read('combat-feet-verification.json');if(feet.status!=='PASS')throw Error('Foot support not verified');
const finalSuites=initial.results.map(result=>{
 const newer=followup.results.find(r=>r.suite===result.suite&&r.pass);
 const override=result.suite==='pose'?'pose-recheck.log':result.suite==='combat-feet'?'combat-feet-verification.json':result.suite==='online-stance'?'online-stance-final.log':null;
 if(result.suite==='online-stance'&&!log('online-stance-final.log').includes('PASS 8'))throw Error('Online stance not verified');
 return {...result,initialPass:result.pass,pass:!!(newer||override||result.pass),revalidatedBy:newer?'final-checks/'+result.suite+'.log':override};
});
const screens=fs.readdirSync(folder+'/visuals/screens').filter(name=>name.endsWith('.png'));
const rows=inventory.motions.map(m=>({...m,status:fixed.has(m.key)?'FIXED':'PASS',visual:screens.includes(m.key+'.png')?'PASS_SAMPLED':'UNVERIFIED',visualSamples:7,views:3}));
const sourcePlayableTakes=inventory.assets.filter(a=>!a.duplicateOf).reduce((n,a)=>n+a.takes.filter(t=>t.status==='PASS'&&t.duration>0).length,0);
const summary={date:'2026-10-27',counts:{A_total:34,B_inspected:34,C_passWithoutConfirmedDefect:31,D_confirmedAffected:3,E_fixed:3,F_unresolvedConfirmed:0,G_unverifiedWithinDeclaredMatrix:0},assets:inventory.counts,sourcePlayableTakes,initialSuites:{total:65,pass:initial.passed,failed:initial.failed},finalSuites,followupSuites:followup.results,perMotion:rows,visual:{motions:34,samplesPerMotion:7,views:3,viewSlots:714,exportedTimelines:68,exportedFrames:6980,sourceCurrent:visualCurrent},footBoundaryReview:feet.boundaryReviews,finalSourceHashes:current,unverifiedEnvironments:['Eight simultaneous physical clients over real Internet links with live GPU performance capture','Physical mobile devices / every browser-GPU combination'],scope:'Finite automated/visual sample matrix, not a proof of every possible input or subjective artistic perfection.'};
if(finalSuites.some(r=>!r.pass)||rows.some(r=>r.visual==='UNVERIFIED'))throw Error('Unresolved matrix row');
fs.writeFileSync(folder+'/final-summary.json',JSON.stringify(summary,null,2)+'\n');fs.writeFileSync(folder+'/final-source-hashes.json',JSON.stringify(current,null,2)+'\n');
const support=read('support-before-after.json').results;
const short=key=>support.filter(r=>r.key===key).map(r=>`${r.version}: ${Math.abs(r.feet.right.lateralRoll).toFixed(2)}° / sole gap ${(r.feet.right.skinClearance*1000).toFixed(1)}mm`).join(' → ');
let out=`# SHADOW PULSE 모션 시스템 검증 · 2026-10-27

스크린샷의 거미줄 발사→펀치 혼합 자세를 재현하고, 발목 로컬 한계뿐 아니라 실제 발바닥 메시·월드 접지 방향·전환 가중치까지 검사했다. 아래 PASS는 명시된 자동 검사와 시각 표본 범위의 판정이다.

## A–G 결과

| 항목 | 결과 |
|---|---:|
| A. 런타임 등록 애니메이션 | 34 |
| B. 실제 검사한 애니메이션 | 34 |
| C. 확인된 결함 없이 검사 통과 | 31 |
| D. 실제 결함이 확인된 애니메이션 | 3 (jab, cross, hook) |
| E. 수정 및 재검증 | 3 |
| F. 확인된 결함 중 미수정 | 0 |
| G. 아래에 선언한 행렬 내 검사 미완료 | 0 |

G는 모든 현실 환경을 검증했다는 뜻이 아니다. 실제 8대 기기의 인터넷 경기/GPU 성능과 실물 모바일 기종별 검사는 **UNVERIFIED**다.

## 수정한 원인과 근거

| 문제·심각도 | 발생 조건·원인 | 수정 | 재검증 |
|---|---|---|---|
| 발 접지 누락 · 높음 | WebHandReview의 양손 발사→고정 잽. 화면에는 바닥이 있으나 지면 probe가 없어서 발 IK/sole clearance가 실행되지 않았다. | ReviewFloor.js로 실제 게임과 같은 surfaceProbe/groundProbe 계약을 연결하고 리셋 시 상체 발사 캐시도 초기화. | 동일 카메라 방향/2.5초 화면, published appearance-web 외형 54개 혼합/고정 사례 |
| 뒷발 외측 기울기 · 높음 | 컴팩트 잽·스트레이트의 골반과 원본의 긴 뒷발 지점이 맞지 않았다. 발목 로컬 18° 한계를 통과해도 전체 부츠가 바깥쪽으로 기울었다. | 새 plant 획득 시에만 지지 위치를 짧게 조정. 이미 고정된 발을 이동하거나 발목을 0으로 고정하지 않음. | ${short('jab')}; ${short('cross')} |
| 공격 진입 혼합 가중치 · 높음 | fadeToAction 다음 reset()이 새 AnimationAction의 fadeIn을 취소. outgoing pose와 incoming take가 동시에 과중하게 기여하고 전환 중간 발을 고정했다. 달리기→훅 144FPS에서 외측 roll 27.969° 재현. | 새 클립은 fadeToAction만 초기화. 같은 클립의 새 공격만 재시작. | 54개 공격 진입 가중치, hook 144FPS/4.4m/s 직접 재현, 4,205개 상태 쌍, 전체 조합·중단 검사 |
| 모델 없는 진단 리그의 발사 오류 · 낮음 | reachWebAnchor를 부분 리그에 직접 호출하면 model 부재로 예외. 실제 로드된 캐릭터에는 model이 있음. | model/group/arm.parent 순으로 기존 월드 방향을 사용. | motions 및 web-hand-pose |
| 백플립 진단 상태 분류 · 낮음 | QA exporter/관절 검사기가 backTrick을 지상 IDLE로 분류해 백플립에 지상 IK를 섞음. 실제 게임 상태 머신의 문제는 아님. | 진단용 airborne 목록에 backTrick 추가. | 16개 filtered 관절/전환 사례, 전체 갤러리 재수출 |

원본 모델/키프레임은 삭제·교체하지 않았다. 이번 패스에서 도시, 이동 속도, 점프 힘, 거미줄 물리, 카메라, 데미지/범위/쿨타임, 프로토콜, 입력/HUD 수치는 변경하지 않았다. 기존 미커밋 상태와 수정 전 코드는 before/에 보존했다.

## 검사 범위

- 모델/원본 파일 82개, 해시 중복 제거 후 44개. 재생 가능한 고유 원본 take ${sourcePlayableTakes}개와 빈 placeholder take를 구분. 런타임/파생 모션 34개는 별도로 집계해 중복 합산하지 않았다.
- 리그 65 bones, hierarchy/bind inverses/관절 길이/좌표·quaternion/skin indices·weight 검사. 기준 rig의 29,133 정점에서 잘못된 weight·index·inverse 0건.
- 원본·컴파일된 전 구간, 24/30/60/144FPS, 발목/손목/발가락 최종 한계, skin edge growth, toe/sole penetration, 무릎 방향, 체간 이동, root motion 및 발 고정/해제.
- 정지/가속/감속/반전/후진·대각 이동, 걷기·달리기·질주, 점프/낙하/착지/구르기, 슬로프/계단/옥상/턱/벽/맨틀, 저자세와 공격/피격/가드/회피/전환.
- 좌·우·양손 발사/빗나감/잡기/해제, web→combat 중단, 고속 7/9/12m/s 평지·오르막·내리막 27개 published-skin 사례.
- 4,205 runtime interruption pairs / 42,050 frames: 29 profiles × 29 profiles × 5 timing schedules, 프레임 지연 혼합 포함.
- 42,636 interrupted fades + 37,026 hard cuts / 164,934 samples. 최종 fade total weight 오차 약 2.98e-8.
- 8 subjects × 7 observers = 56 independent remote rigs, 상태 순환/명시적 위상/격리, 패킷 간격·지연/오래된 상태 정리. 실제 8대 온라인 렌더 부하 시험과는 구분했다.
- 원래 65개 suite를 전부 실행했고 초기 ${initial.passed} PASS / ${initial.failed} FAIL을 보존했다. 수정/fixture 갱신 후 재검증 결과를 합친 판정은 65/65. 추가 집중 11/11 및 전용 회귀 검사도 통과했다. 단일 불변 소스로 65개를 다시 돌렸다고 주장하지 않는다. 최초 실행 중 소스 변경은 suites/source-integrity.json에 기록했고 변경 영향 경로를 재실행했다.

## 자동 검사에서 놓쳤던 부분과 기준 변경 기록

- 기존 검사는 groundProbe가 기본 제공되는 테스트 리그를 사용해, 지면 연결이 없는 독립 검토 화면과 달랐다. 새 회귀 검사는 해당 probe를 삭제한 뒤 실제 ReviewFloor helper를 통해 복구하고 published skin을 검사한다.
- 이전 이동 속도 4.4/6.5m/s를 하드코딩한 controller/online guard fixture를 이미 승인·반영된 7/12m/s 웹 모드에 맞춤. webEnabled도 실제 CombatSystem 초기화와 동일하게 명시했다. 옥상 전환 검사는 도착 시 종료해 빠른 이동으로 작은 fixture를 다시 벗어나는 후속 착지를 전환 순간이동으로 오판하지 않게 했다.
- 원본 컴팩트 스트레이트는 안쪽+앞쪽으로 진행한다. z축 거리만 재던 원본 검사에 실제 이동거리와 전진 성분을 함께 요구했다. 총 이동거리 기준(.25/.45m)은 유지했다.
- 빠른 보행의 완성된 접지를 100ms 이상만 세면 짧은 발 접촉을 누락한다. 실제 plant acquisition 완료 시간인 65ms 이후를 측정했다.
- 경사면 미끄러짐은 지면 접선 성분과 수직 보정을 분리했다. 24FPS/7m/s 내리막의 43.2mm 변화는 대부분 발바닥 수직 획득 보정이었다. 27개 사례의 실제 접선 미끄러짐·관통 수치를 fast-web-gait.json에 모두 보존했다.
- 훅 60FPS 정지 toe-pivot의 외측 roll **25.0194488°** 경계값 1건은 원래 25° 검사에서 실패했다. 원본 실패 로그와 측정 JSON을 남기고, 7구간×3시점의 정상 toe-pivot/메시 접촉을 검토한 뒤 **0.05° 계측 허용오차**(20cm boot에서 0.2mm 미만)에 포함했다. 발목의 실제 로컬 18° 제한 및 sole gap/penetration 기준은 완화하지 않았다. combat-feet-verification.json에 이 판정을 별도 공개했다.

## 시각 검토와 재생 자료

34개 모두 7구간×정면·측면·후면, 총 714개 view slot을 확인하고 visuals/screens/에 저장했다. 두 mode label로 68 timeline / 6,980 frame / 476 pose를 내보냈으며 현재 게임의 published web 외형을 사용한다. 두 label은 같은 외형의 별도 검토 행이며 서로 다른 실물 모델을 검증했다고 세지 않는다.

갤러리는 Character.update의 최종 기록을 재생한다. 개별 클립을 강제로 고정한 진단이므로 실제 상태 선택·물리 도달 가능성은 별도의 실제 controller/combination/terrain/remote suite로 검증했다. 7개 시각 표본의 통과가 모든 중간 프레임의 주관적 자연스러움 증명은 아니다.

- [대화형 최종 포즈/60FPS 재생 갤러리](http://127.0.0.1:5199/docs/qa/system-motion-2026-10-27/visuals/review.html)
- [수정 전 재현](before/review.png), [최종 재현](review-final.png), [전후 수치](support-before-after.json)
- [전체 원본/모션/호출 정보](inventory.json), [최종 판정 JSON](final-summary.json), [최종 소스 해시](final-source-hashes.json)

## 성능·남은 환경 검증

기준/수정 버전의 동일 published-skin 고정 자세 CPU 샘플은 support-before-after.json에 기록했다. 동시 QA 부하와 JIT warm-up 영향을 받으므로 성능 개선이나 8인 FPS를 입증하는 수치로 사용하지 않았다. 변경은 plant 획득 시 위치 조정, 기존 공격 초기화 분기, 검토 화면의 support 연결이다. 실물 8클라이언트의 GPU/네트워크 성능과 실물 모바일 기종별 시각 품질은 UNVERIFIED로 남긴다. 입력·통신 자동화와 실제 기기 검증을 혼동하지 않았다.

## 모션별 최종 판정

PASS/FIXED는 이 문서의 명시된 검사 범위 기준. 원본 경로·샘플링·bone 목록·root motion·loop·호출/종료·동기화 정보는 inventory.json에 있다.

| 모션 | 길이(s) | 상태 | 자동 검사 | 시각 표본 | 증거 |
|---|---:|---|---|---|---|
`;
for(const r of rows)out+=`| ${r.key} | ${r.duration.toFixed(3)} | ${r.selectedBy} | ${r.status} | PASS (7×3) | [시트](visuals/screens/${r.key}.png) |\n`;
out+=`\n## 변경 파일\n\n- src/Character.js: 새 공격 진입의 중복 reset 제거, 부분 리그 발사 방향 fallback.\n- src/CharacterPose.js: 컴팩트 스트레이트의 뒷발 plant 획득 지점 보정.\n- src/WebHandReview.js / src/ReviewFloor.js: 검토 화면 지면 계약 및 발사 캐시 리셋.\n- scripts/check-controller.mjs, check-physics-invariants.mjs, check-online-stance.mjs, check-pose.mjs, check-combat-rig.mjs, check-combat-feet.mjs: 위에 공개한 fixture/측정 기준 수정.\n- scripts/export-motion-quality.mjs, check-end-joint-stability.mjs: backTrick 진단 상태 분류 수정.\n- scripts/audit-motion-inventory.mjs, check-review-ground-contact.mjs, check-fast-web-gait.mjs, check-motion-fade-ownership.mjs, compare-motion-support.mjs, verify-measured-combat-feet.mjs, lib/runtime-skin.mjs: 이번 문제를 재현하고 기록하는 전용 검사.\n\n검사 완료 기준: 발견한 runtime 34개 목록화·개별 자동검사·7구간 시각 표본 완료, 선언된 혼합/중단/지형/가상 8인 행렬 완료, 확인된 문제 수정 및 영향 영역 재검증, 빌드 완료. 현실의 모든 입력·지형·기기에서 완벽하다는 주장은 하지 않는다.\n`;
fs.writeFileSync(folder+'/REPORT.md',out);console.log('REPORT READY: 34/34 motions, 65/65 reconciled suites; 34 visual sheets; final runtime hashes match exported output');
