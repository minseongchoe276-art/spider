import { createClient } from '@supabase/supabase-js';

// This is a publishable browser key. All room writes go through authenticated
// database commands; the underlying tables deny direct client access.
const projectUrl = import.meta.env?.VITE_SUPABASE_URL || 'https://zzencpfytpdbjmqvtquc.supabase.co';
const publishableKey = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_RmGBXvDq4fk7ZJdL295uzw_5SBwGyCS';

export class SupabaseRooms {
  constructor() {
    this.readyState = WebSocket.CONNECTING;
    this.roomCode = null;
    this.channel = null;
    this.client = createClient(projectUrl, publishableKey);
    this.open();
  }

  emit(data) {
    if (data) this.onmessage?.({ data: JSON.stringify(data) });
  }

  async rpc(name, args = {}) {
    const { data, error } = await this.client.rpc(name, args);
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
      const pendingCode = new URLSearchParams(location.search).get('join')?.toUpperCase();
      const resumed = await this.rpc('game_resume');
      if (resumed?.room?.code) {
        if (pendingCode && pendingCode !== resumed.room.code) {
          await this.command('leave');
        } else {
          this.resumedCode = resumed.room.code;
          await this.subscribe(resumed.room.code);
          this.emit({ type: 'joined', id: this.userId });
          this.emit(resumed);
        }
      }
      this.onopen?.();
      this.listTimer = setInterval(() => {
        if (!this.roomCode) this.list().catch(error => this.fail(error));
      }, 5000);
      this.heartbeatTimer = setInterval(() => {
        if (this.roomCode) this.command('heartbeat').then(state => this.emit(state)).catch(error => this.fail(error));
      }, 15000);
    } catch (error) {
      this.fatal = true;
      this.fail(error);
      this.readyState = WebSocket.CLOSED;
      this.onclose?.();
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
    this.dispatch(data).catch(error => this.fail(error));
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

  async subscribe(code) {
    if (this.channel) await this.client.removeChannel(this.channel);
    this.roomCode = code;
    this.channel = this.client.channel(`game:${code}`, { config: { private: true } })
      .on('broadcast', { event: 'state' }, ({ payload }) => this.emit(payload))
      .on('broadcast', { event: 'move' }, ({ payload }) => this.emit(payload))
      .on('broadcast', { event: 'hit' }, ({ payload }) => this.emit(payload))
      .subscribe((status, error) => {
        if (status === 'SUBSCRIBED') this.refreshState().catch(err => this.fail(err));
        if (status === 'CHANNEL_ERROR') this.fail(error || new Error('방 실시간 연결에 실패했습니다.'));
      });
  }

  async refreshState() {
    if (!this.roomCode) return;
    const state = await this.rpc('game_state', { p_code: this.roomCode });
    this.emit(state);
  }

  async dispatch(data) {
    if (data.type === 'list') return this.list();
    if (data.type === 'create' || data.type === 'join') {
      const state = await this.command(data.type, data);
      if (state?.type === 'switch-city') return this.emit(state);
      if (!state?.room?.code) throw new Error('방을 열지 못했습니다.');
      await this.subscribe(state.room.code);
      this.emit({ type: 'joined', id: this.userId });
      this.emit(state);
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
    if (['ready', 'start', 'rematch', 'move', 'attack'].includes(data.type)) {
      this.emit(await this.command(data.type, data));
    }
  }
}
