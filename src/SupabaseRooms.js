import { createClient } from '@supabase/supabase-js';
import { sanitizePose } from './RemoteMotion.js';

// This is a publishable browser key. All room writes go through authenticated
// database commands; the underlying tables deny direct client access.
const projectUrl = import.meta.env?.VITE_SUPABASE_URL || 'https://zzencpfytpdbjmqvtquc.supabase.co';
const publishableKey = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_RmGBXvDq4fk7ZJdL295uzw_5SBwGyCS';
let roomClient;

export function roomErrorText(error) {
  return [error?.message, error?.details, error?.hint].filter(Boolean).join('\n');
}

// Join checks the room capacity before it checks whether this user is already
// inside. Rejoining a full room you occupy raises "방이 가득 찼습니다."
// A room with a free seat raises "먼저 현재 방에서 나가세요." Both are HTTP 400.
export function roomEntryRecovery(error, action, data, resumed) {
  const message = roomErrorText(error);
  const wanted = String(data?.code || '').toUpperCase();
  const current = String(resumed?.room?.code || '').toUpperCase();
  const stuck = message.includes('먼저 현재 방');
  const full = message.includes('방이 가득');
  if (action === 'join' && current && current === wanted && (stuck || full)) {
    if (data?.city && resumed.room.city && resumed.room.city !== data.city) {
      return { type: 'switch-city', city: resumed.room.city, code: current };
    }
    return { type: 'enter', state: resumed };
  }
  if (stuck && current && (action === 'create' || action === 'join')) return { type: 'leave-retry' };
  return { type: 'fail' };
}

export function roomAuthOptions(storage, newId = () => crypto.randomUUID()) {
  if (!storage) return {persistSession:false};
  try {
    let id=storage.getItem('spider-room-auth-id');
    if (!id) {id=newId();storage.setItem('spider-room-auth-id',id);}
    // GoTrue broadcasts auth events using storageKey even with sessionStorage.
    // A distinct key prevents one tab's login replacing another tab's Realtime JWT.
    return {storage,storageKey:`spider-room-${id}`};
  } catch {return {persistSession:false};}
}

export class SupabaseRooms {
  constructor() {
    this.readyState = WebSocket.CONNECTING;
    this.roomCode = null;
    this.channel = null;
    roomClient ||= createClient(projectUrl,publishableKey,{
      auth:roomAuthOptions(typeof sessionStorage==='undefined'?null:sessionStorage),
    });
    this.client = roomClient;
    this.controlQueue = Promise.resolve();
    this.open();
  }

  emit(data) {
    if (data) this.onmessage?.({ data: JSON.stringify(data) });
  }

  async rpc(name, args = {}) {
    const started=performance.now();
    const { data, error } = await this.client.rpc(name, args);
    this.lastRpcMs=performance.now()-started;
    if (error) throw error;
    return data;
  }

  async open() {
    try {
      let { data: { session }, error } = await this.client.auth.getSession();
      if (error) throw error;
      if (!session) {
        const result = await this.client.auth.signInAnonymously();
        if (result.error) throw result.error;
        session = result.data.session;
      }
      if (!session) throw new Error('익명 로그인을 시작하지 못했습니다.');
      this.userId = session.user.id;
      await this.client.realtime.setAuth(session.access_token);
      this.readyState = WebSocket.OPEN;
    } catch (error) {
      this.fatal = true;
      this.fail(error);
      this.readyState = WebSocket.CLOSED;
      this.onclose?.();
      return;
    }
    try {
      const pendingCode = new URLSearchParams(location.search).get('join')?.toUpperCase();
      const resumed = await this.rpc('game_resume');
      if (resumed?.room?.code) {
        if (pendingCode && pendingCode !== resumed.room.code) {
          try { await this.command('leave'); } catch (error) { this.fail(error); }
        } else {
          this.resumedCode = resumed.room.code;
          await this.presentRoom(resumed);
        }
      }
    } catch (error) {
      this.fail(error);
    }
    this.onopen?.();
    this.listTimer = setInterval(() => {
      if (!this.roomCode) this.list().catch(error => this.fail(error));
    }, 5000);
    this.heartbeatTimer = setInterval(() => { this.beat(this.roomCode); }, 15000);
  }

  lostMembership(error) {
    return roomErrorText(error).includes('참가하지 않았습니다');
  }

  releaseMembership(code) {
    if (!code || code !== this.roomCode) return;
    this.roomCode = null;
    const old = this.channel;
    this.channel = null;
    if (old) this.client?.removeChannel(old).catch(() => {});
    this.emit({ type: 'left' });
  }

  async beat(code) {
    if (!code || code !== this.roomCode || this.readyState !== WebSocket.OPEN) return;
    try {
      const state = await this.command('heartbeat');
      if (code === this.roomCode && this.readyState === WebSocket.OPEN) this.emit(state);
    } catch (error) {
      if (this.lostMembership(error)) this.releaseMembership(code);
      else this.fail(error);
    }
  }

  fail(error) {
    const message = /anonymous sign-ins are disabled/i.test(error?.message || '')
      ? 'Supabase 프로젝트에서 익명 로그인을 켜야 방을 사용할 수 있습니다.'
      : error?.message || '방 요청을 처리하지 못했습니다.';
    this.emit({ type: 'error', message });
  }

  send(raw) {
    if (this.readyState !== WebSocket.OPEN) return;
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    if (data.type==='move') {
      if (this.movePending) return;
      this.movePending=true;
      this.dispatch(data).catch(error=>this.fail(error)).finally(()=>{this.movePending=false;});
      return;
    }
    if(data.type==='attack' && this.city==='hong-kong'){
      if((this.attackInFlight||0)>=4){this.fail(new Error('서버 피격 판정이 지연되고 있습니다. 잠시 후 다시 공격하세요.'));return;}
      this.attackInFlight=(this.attackInFlight||0)+1;
      this.dispatch(data).catch(error=>this.fail(error)).finally(()=>{this.attackInFlight--;});
      return;
    }
    const entry = data.type==='create' || data.type==='join';
    if (entry && this.entryPending) return;
    if (entry) this.entryPending = true;
    let task = this.controlQueue.then(()=>this.dispatch(data)).catch(error=>this.fail(error));
    if (entry) task = task.finally(()=>{ this.entryPending = false; });
    this.controlQueue = task;
  }

  async list() {
    const rooms = await this.rpc('game_list');
    this.emit({ type: 'rooms', rooms });
  }

  async command(action, data = {}) {
    return this.rpc('game_command', {
      p_action: action,
      p_data: { ...data, code: data.code || this.roomCode },
    });
  }

  async enter(action, data) {
    const resumed = await this.rpc('game_resume').catch(() => null);
    const wanted = String(data?.code || '').toUpperCase();
    const current = String(resumed?.room?.code || '').toUpperCase();
    if (action === 'join' && current && current === wanted) {
      if (data?.city && resumed.room.city && resumed.room.city !== data.city) {
        return { type: 'switch-city', city: resumed.room.city, code: current };
      }
      return resumed;
    }
    try {
      return await this.command(action, data);
    } catch (error) {
      const latest = await this.rpc('game_resume').catch(() => resumed);
      const plan = roomEntryRecovery(error, action, data, latest);
      if (plan.type === 'enter') return plan.state;
      if (plan.type === 'switch-city') return plan;
      if (plan.type === 'leave-retry') {
        try { await this.rpc('game_command', { p_action: 'leave', p_data: {} }); }
        catch (leaveError) { if (!this.lostMembership(leaveError)) throw leaveError; }
        this.roomCode = null;
        return await this.command(action, data);
      }
      throw error;
    }
  }

  async presentRoom(state) {
    if (!state?.room?.code) throw new Error('방을 열지 못했습니다.');
    this.roomCode = state.room.code;
    this.city = state.room.city;
    this.emit({ type: 'joined', id: this.userId });
    this.emit(state);
    try {
      await this.subscribe(state.room.code);
      await this.refreshState();
    } catch (error) {
      this.fail(error);
    }
  }

  async subscribe(code) {
    const old=this.channel;this.channel=null;
    if (old) await this.client.removeChannel(old);
    this.roomCode = code;
    // Queued broadcasts from an old subscription must not restore a room
    // after leaving it or overwrite a newly joined room's state.
    const emitCurrent=payload=>{
      if(this.channel===channel && this.roomCode===code && this.readyState===WebSocket.OPEN)this.emit(payload);
    };
    const channel = this.client.channel(`game:${code}`, { config: { private: true } })
      .on('broadcast', { event: 'state' }, ({ payload }) => emitCurrent(payload))
      .on('broadcast', { event: 'move' }, ({ payload }) => emitCurrent(payload))
      .on('broadcast', { event: 'hit' }, ({ payload }) => emitCurrent(payload))
      .on('broadcast', { event: 'hit-check' }, ({payload})=>{if(payload?.target===this.userId)emitCurrent(payload);})
      .on('broadcast', { event: 'pose' }, ({ payload }) => {
        const pose=sanitizePose(payload?.pose);
        if (pose) emitCurrent({type:'pose',id:payload.id,pose});
      });
    this.channel=channel;
    await new Promise((resolve,reject)=>{
      let joined=false;
      const timer=setTimeout(()=>reject(new Error('방 실시간 연결 시간이 초과되었습니다. 대기실 상태는 유지됩니다.')),8000);
      channel.subscribe((status,error)=>{
        if (this.channel!==channel) return;
        if (status==='SUBSCRIBED') {
          clearTimeout(timer);
          if (joined) this.refreshState().catch(err=>this.fail(err));
          joined=true; resolve();
        } else if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) {
          clearTimeout(timer);
          const failure=error || new Error('방 실시간 연결이 중단되었습니다. 다시 연결합니다.');
          if (joined) this.close(); else reject(failure);
        }
      });
    });
  }

  close() {
    if (this.readyState===WebSocket.CLOSED) return;
    this.readyState=WebSocket.CLOSED;
    clearInterval(this.listTimer);clearInterval(this.heartbeatTimer);
    const old=this.channel;this.channel=null;
    if (old) this.client.removeChannel(old).catch(()=>{});
    this.client.realtime.disconnect();this.onclose?.();
  }

  async refreshState() {
    if (!this.roomCode) return;
    const code=this.roomCode;
    try {
      const state = await this.rpc('game_state', { p_code: code });
      if(code===this.roomCode && this.readyState===WebSocket.OPEN)this.emit(state);
    } catch (error) {
      if (this.lostMembership(error)) this.releaseMembership(code);
      else throw error;
    }
  }

  async dispatch(data) {
    if (data.type === 'list') return this.list();
    if (data.type === 'create' || data.type === 'join') {
      const state = await this.enter(data.type, data);
      if (state?.type === 'switch-city') return this.emit(state);
      await this.presentRoom(state);
      return;
    }
    if (data.type === 'leave') {
      const result = await this.command('leave');
      const old = this.channel;
      this.channel = null;
      this.roomCode = null;
      if (old) await this.client.removeChannel(old);
      this.emit(result || { type: 'left' });
      return;
    }
    if (!this.roomCode) return;
    if(data.type==='hit-confirm')return;
    if(data.type==='attack' && this.city==='hong-kong'){
      const code=this.roomCode;
      const {data:result,error}=await this.client.functions.invoke('hong-kong-attack',{body:{code,kind:data.kind,facing:data.facing}});
      if(code!==this.roomCode || this.readyState!==WebSocket.OPEN)return;
      if(error)throw error;
      if(code===this.roomCode && this.readyState===WebSocket.OPEN){
        if(result?.error)throw new Error(result.error);
        if(result?.status==='UNKNOWN')throw new Error('공식 지형 판정을 준비하지 못했습니다. 잠시 후 다시 공격하세요.');
        this.emit(result);
      }
      return;
    }
    if (['ready', 'start', 'rematch', 'move', 'attack', 'hit-confirm'].includes(data.type)) {
      const code=this.roomCode;
      const pose=data.type==='move' ? sanitizePose(data.pose) : null;
      let result;
      try {
        result= data.type==='move'
          ? await this.rpc('game_move_pose',{p_data:{...data,pose,code:this.roomCode}})
          : await this.command(data.type,data);
      } catch (error) {
        if (this.lostMembership(error)) { this.releaseMembership(code); return; }
        throw error;
      }
      if(code===this.roomCode && this.readyState===WebSocket.OPEN)this.emit(result);
    }
  }
}
