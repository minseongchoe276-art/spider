import {MATCH} from './MatchRules.js';

export const isCombatMode = mode => ['tag','custom'].includes(mode);
export function canAttack(room, player) {
  return !!player && room?.phase==='playing' && !player.eliminated &&
    (room.mode==='custom' || (room.mode==='tag' && player.team==='police'));
}
export function opponents(room, attacker, target) {
  if(!attacker || !target || attacker.id===target.id)return false;
  if(room.mode==='custom')return room.format==='ffa' || attacker.team!==target.team;
  return attacker.team==='police' && target.team==='runner';
}
// Feet positions; horizontal distance and height are independent and inclusive.
// Both the client preview and authoritative server use this exact gate.
export function attackGate(from,to,kind,facing) {
  const rule=MATCH[kind];
  if(!['punch','web'].includes(kind) || !rule || ![from?.x,from?.y,from?.z,to?.x,to?.y,to?.z,facing].every(Number.isFinite))return 'invalid';
  const dx=to.x-from.x,dz=to.z-from.z,distance=Math.hypot(dx,dz);
  if(distance>rule.reach)return 'range';
  if(Math.abs(to.y-from.y)>rule.vertical)return 'height';
  if(distance>.35 && Math.cos(Math.atan2(dx,dz)-facing)<rule.cone)return 'aim';
  return null;
}
export const ATTACK_REASONS={range:'사거리 밖',height:'높이 차 초과',aim:'정면 공격 범위 밖',blocked:'벽·건물에 가림',target:'공격 가능한 상대 없음',stale:'위치 갱신 대기',protected:'시작 보호 중',cooldown:'재사용 대기 중',terrain:'지형 판정 준비 중',invalid:'공격 정보 오류'};
export const teamName = team => team==='red'?'레드 팀':team==='blue'?'블루 팀':team==='police'?'경찰':team==='runner'?'도망자':'개인전';
