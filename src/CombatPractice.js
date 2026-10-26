import * as THREE from 'three';
import {resolveBody} from './MovementCollision.js';
import {createTrainingOpponent,poseTrainingOpponent} from './TrainingOpponent.js';
export class CombatPractice {
  constructor(game){this.game=game;this.projectiles=[];this.active=false;
    document.getElementById('btn-practice')?.addEventListener('click',()=>this.start(document.getElementById('practice-type').value));
    document.getElementById('btn-practice-stop')?.addEventListener('click',()=>this.stop());}
  supported(point){const p=this.game.physics,h=p.supportHeight(point);return Number.isFinite(h)&&Math.abs(h+.1-point.y)<.6;}
  start(type='melee') {
    const g=this.game;if(g.multiplayer?.room)return g.showNotice('온라인에서는 개인 전투 연습을 시작할 수 없습니다.');
    if(!g.assetsReady)return g.showNotice('게임과 지형 로딩이 완료된 뒤 연습을 시작하세요.');
    if(!g.isPlaying){g.multiplayer?.beginSolo();if(!g.isPlaying)return;}
    if(!g.experience.safe(g.physics.position))return g.showNotice('평평하고 충분히 넓은 바닥에서 연습을 시작하세요.');
    this.stop();const origin=g.physics.position.clone(),types=type==='mixed'?['melee','ranged','shield']:[type];
    let index=0;for(const kind of types){let spawn=null;
      for(let i=0;i<16;i++){const angle=(i+index*5)/16*Math.PI*2,candidate=origin.clone().add(new THREE.Vector3(Math.sin(angle)*5,0,Math.cos(angle)*5));
        const h=g.physics.supportHeight(candidate);if(!Number.isFinite(h)||Math.abs(h+.1-origin.y)>.6)continue;candidate.y=h+.1;
        if(!g.experience.safe(candidate)||g.combat.obstructed(origin.clone().add(new THREE.Vector3(0,1,0)),candidate.clone().add(new THREE.Vector3(0,1,0))))continue;spawn=candidate;break;}
      if(!spawn)continue;this.spawn(kind,spawn);index++;
    }
    if(!index)return g.showNotice('상대를 놓을 안전한 공간이 부족합니다. 넓은 옥상이나 거리에서 시작하세요.');
    this.active=true;this.origin=origin;g.combat.cancel();g.combat.health=g.combat.stamina=100;
    if(g.combat.mode!=='combat')g.combat.toggle(g.input);g.clearInput();g.setPaused(false);
    g.canvas?.focus();
    g.showNotice('전투 연습 · 붉은 예고는 회피, 근접 공격은 정면 방어 · 방패에는 훅 / 강공격');
  }
  spawn(type,position){const scene=this.game.scene,{group,body,shield,pose}=createTrainingOpponent(type);
    const ring=new THREE.Mesh(new THREE.RingGeometry(.5,.62,24),new THREE.MeshBasicMaterial({color:0xff526d,side:THREE.DoubleSide,transparent:true,opacity:.8}));ring.rotation.x=-Math.PI/2;ring.position.y=.04;ring.visible=false;group.add(ring);
    const bar=new THREE.Mesh(new THREE.PlaneGeometry(.8,.07),new THREE.MeshBasicMaterial({color:0x96ffe8,side:THREE.DoubleSide}));bar.position.y=2.08;group.add(bar);
    group.position.copy(position);scene.add(group);const enemy={type,position,spawn:position.clone(),mesh:group,body,ring,bar,shield,pose,health:type==='shield'?140:100,maxHealth:type==='shield'?140:100,cooldown:1.5,windup:0,flash:0,stagger:0,facing:0};this.game.combat.enemies.push(enemy);return enemy;}
  update(delta){const g=this.game;if(!this.active||g.multiplayer?.room)return;
    if(!g.combat.enemies.length){this.stop();return;}
    for(const e of g.combat.enemies){if(e.health<=0)continue;
      e.flash=Math.max(0,e.flash-delta);e.stagger=Math.max(0,e.stagger-delta);e.cooldown=Math.max(0,e.cooldown-delta);
      poseTrainingOpponent(e,delta,!!g.preferences?.values.reducedMotion);
      e.bar.scale.x=e.health/e.maxHealth;e.bar.quaternion.copy(e.mesh.quaternion).invert().multiply(g.camera.quaternion);e.ring.visible=e.windup>0;
      const offset=g.physics.position.clone().sub(e.position),distance=offset.length();e.facing=Math.atan2(offset.x,offset.z);e.mesh.rotation.y=e.facing;
      if(e.type==='dummy'||e.stagger>0)continue;
      if(distance>45){e.windup=0;continue;}
      if(e.windup>0){e.windup-=delta;e.ring.scale.setScalar(1+Math.max(0,e.windup));if(e.windup<=0){e.cooldown=e.type==='ranged'?2.5:1.25;e.strike=.3;
          if(e.type==='ranged')this.fire(e);else if(distance<2.5&&!g.combat.obstructed(e.position.clone().add(new THREE.Vector3(0,1,0)),g.physics.position.clone().add(new THREE.Vector3(0,1,0)))){
            g.combat.receiveDamage(e.type==='shield'?20:12,e);
            // Reset replaces the enemy array while this loop still owns the
            // old iterator. Retire it before another enemy hits the new life.
            if(!g.combat.enemies.length){this.stop();return;}
          }}
        continue;}
      const desired=e.type==='ranged'?9:1.8;
      if(distance<desired+.6&&e.cooldown===0&&!g.combat.obstructed(e.position.clone().add(new THREE.Vector3(0,1,0)),g.physics.position.clone().add(new THREE.Vector3(0,1,0)))){e.windup=e.type==='ranged'?.9:.7;e.aim=g.physics.position.clone().add(new THREE.Vector3(0,1,0));continue;}
      if(distance>desired&&Math.abs(offset.y)<1.5){const velocity=offset.setY(0).normalize().multiplyScalar(e.type==='shield'?1.5:2.5),target=e.position.clone().addScaledVector(velocity,delta);
        const resolved=g.city.resolveMovement?g.city.resolveMovement(e.position,target,velocity):resolveBody(e.position,target,velocity,g.city.colliders||[]);
        if(this.supported(resolved.position))e.position.copy(resolved.position);e.mesh.position.copy(e.position);}
    }
    // A defeat resets combat and removes opponents during receiveDamage.
    // Stop here so an empty opponent list cannot be mistaken for a victory.
    if(!g.combat.enemies.length){this.stop();return;}
    for(let i=this.projectiles.length-1;i>=0;i--){const shot=this.projectiles[i],previous=shot.mesh.position.clone();shot.life-=delta;shot.mesh.position.addScaledVector(shot.velocity,delta);
      const movement=shot.mesh.position.clone().sub(previous),length=movement.length();
      const blocked=length>0&&g.city.raycast?.(previous,movement.clone().normalize(),length);
      const offset=g.physics.position.clone().add(new THREE.Vector3(0,1,0)).sub(previous);
      const along=length?offset.dot(movement)/length:0;
      const perpendicularSq=Math.max(0,offset.lengthSq()-along*along);
      const halfChord=Math.sqrt(Math.max(0,.36-perpendicularSq));
      const hitDistance=Math.max(0,along-halfChord);
      const hit=perpendicularSq<.36 && along+halfChord>=0 && hitDistance<=length;
      // The first surface along the segment wins. A wall beyond the player
      // must not cancel an earlier hit on a long/slow frame.
      const playerFirst=hit && (!blocked || (Number.isFinite(blocked.distance)&&hitDistance<blocked.distance));
      if(playerFirst){
        // Guard the incoming shot, even if its shooter has moved behind us.
        g.combat.receiveDamage(10,{position:previous});
        // Defeat respawns the player and clears enemies. Retire every shot
        // before another projectile can damage the new life in this frame.
        if(!g.combat.enemies.length){this.stop();return;}
      }
      if(blocked||hit||shot.life<=0){g.scene.remove(shot.mesh);shot.mesh.geometry.dispose();shot.mesh.material.dispose();this.projectiles.splice(i,1);}
    }
    if(g.combat.enemies.length&&g.combat.enemies.every(e=>e.health<=0)){g.showNotice('전투 연습 완료 · 메뉴에서 다시 시작할 수 있습니다.');this.stop();}
  }
  fire(enemy){const g=this.game,origin=enemy.position.clone().add(new THREE.Vector3(0,1,0));if(!enemy.aim)return;
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),new THREE.MeshBasicMaterial({color:0xff6475}));mesh.position.copy(origin);g.scene.add(mesh);
    this.projectiles.push({mesh,enemy,velocity:enemy.aim.clone().sub(origin).normalize().multiplyScalar(14),life:3});}
  stop(){this.active=false;for(const s of this.projectiles){this.game.scene.remove(s.mesh);s.mesh.geometry.dispose();s.mesh.material.dispose();}this.projectiles=[];this.game.combat.clearEnemies();}
}
