const $ = id => globalThis.document?.getElementById(id) || null;
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};
const LABELS = { tag: '경찰과 도망자', custom: '사용자 설정', free: '자유 플레이' };
const TEAMS = { police: '경찰', runner: '도망자', red: '레드', blue: '블루', free: '자유', ffa: '개인' };
const PHASES = { waiting: '대기', playing: '진행', finished: '종료' };
const STATS = [
  ['connected', '접속', '로비·혼자·방 안을 합친 수'],
  ['lobby', '로비', '방을 고르는 중'],
  ['solo', '혼자 플레이', '싱글 플레이'],
  ['waiting', '대기실', '시작 전 방에 연결됨'],
  ['playing', '경기 중', '매치에 연결됨'],
  ['finished', '종료 후', '끝난 방에 남아 있음'],
  ['reconnecting', '재접속 대기', '끊긴 자리. 접속에 포함하지 않음'],
];

function duration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return '';
  const whole = Math.floor(value);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  if (hours) return `${hours}시간 ${minutes}분`;
  if (minutes) return `${minutes}분 ${rest}초`;
  return `${rest}초`;
}

function clock(ms) {
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export class AdminConsole {
  constructor(multiplayer) {
    this.mp = multiplayer;
    this.token = '';
    this.timer = null;
    this.pending = null;
    this.root = $('admin-overlay');
    if (!this.root) return;
    $('open-admin')?.addEventListener('click', () => this.open());
    $('open-admin-pause')?.addEventListener('click', () => this.open());
    $('admin-login')?.addEventListener('submit', event => { event.preventDefault(); this.unlock(); });
    $('admin-refresh')?.addEventListener('click', () => this.request());
    $('admin-lock')?.addEventListener('click', () => this.lock());
    $('admin-close')?.addEventListener('click', () => this.close());
  }

  get isOpen() { return !!this.root && !this.root.classList.contains('hidden'); }

  open() {
    if (!this.root) return;
    if (this.mp.game?.isPlaying && !this.mp.game.isPaused) this.mp.game.setPaused(true);
    this.root.classList.remove('hidden');
    try { this.token = sessionStorage.getItem('web-runner-admin-token') || ''; } catch { this.token = ''; }
    const input = $('admin-token');
    if (input) input.value = this.token;
    if (this.token) this.request();
    else this.setStatus('관리자 키를 입력하세요. 위치는 표시하지 않습니다.');
    input?.focus();
  }

  close() {
    clearTimeout(this.pending);
    clearInterval(this.timer);
    this.timer = null;
    this.root?.classList.add('hidden');
  }

  lock(resetStatus = true) {
    this.token = '';
    try { sessionStorage.removeItem('web-runner-admin-token'); } catch {}
    clearInterval(this.timer);
    this.timer = null;
    const input = $('admin-token');
    if (input) input.value = '';
    $('admin-login')?.classList.remove('hidden');
    $('admin-body')?.classList.add('hidden');
    $('admin-refresh')?.classList.add('hidden');
    $('admin-lock')?.classList.add('hidden');
    if (resetStatus) this.setStatus('관리자 키를 입력하세요.');
  }

  unlock() {
    this.token = $('admin-token')?.value.trim() || '';
    if (!this.token) { this.setStatus('키를 입력하세요.'); return; }
    this.request();
  }

  request() {
    if (!this.token) return;
    clearTimeout(this.pending);
    this.pending = setTimeout(() => {
      const features = this.mp.serverCapabilities;
      if (Array.isArray(features) && features.length && !features.includes('admin-overview')) {
        this.setStatus('방 서버(Render) 업데이트 배포 대기 중이거나 응답이 없습니다.');
      } else {
        this.setStatus('응답이 없습니다. 잠시 후 다시 시도하세요.');
      }
    }, 8000);
    this.setStatus('현황을 불러오는 중…');
    if (!this.mp.send({ type: 'admin', token: this.token })) {
      clearTimeout(this.pending);
      this.setStatus('서버에 연결되지 않았습니다.');
    }
  }

  receive(data) {
    clearTimeout(this.pending);
    if (!data?.ok) {
      const message = data?.message || '관리자 현황을 읽지 못했습니다.';
      if (message.includes('올바르지') || message.includes('설정되지')) this.lock(false);
      this.setStatus(message);
      return;
    }
    try { sessionStorage.setItem('web-runner-admin-token', this.token); } catch {}
    $('admin-login')?.classList.add('hidden');
    $('admin-body')?.classList.remove('hidden');
    $('admin-refresh')?.classList.remove('hidden');
    $('admin-lock')?.classList.remove('hidden');
    this.render(data);
    const transport = data.transport === 'supabase' ? 'Supabase' : '방 서버';
    const uptime = duration(data.uptimeSeconds);
    this.setStatus(`접속 ${data.online?.connected ?? 0}명 · ${transport}${uptime ? ` · 가동 ${uptime}` : ''} · ${clock(data.serverNow)}`);
    clearInterval(this.timer);
    this.timer = setInterval(() => { if (this.isOpen) this.request(); }, 5000);
  }

  setStatus(text) {
    const status = $('admin-status');
    if (status) status.textContent = text;
  }

  render(data) {
    const body = $('admin-body');
    if (!body) return;
    body.replaceChildren();
    const stats = make('div', 'admin-stats');
    for (const [key, label, hint] of STATS) {
      const card = make('div', 'admin-stat');
      card.append(make('b', '', String(data.online?.[key] ?? 0)), make('span', '', label), make('small', '', hint));
      stats.append(card);
    }
    body.append(stats);
    const rooms = data.rooms || {};
    body.append(make('p', 'admin-summary', `방 ${rooms.total ?? 0}개 · 대기 ${rooms.waiting ?? 0} · 진행 ${rooms.playing ?? 0} · 종료 ${rooms.finished ?? 0} · 자리 ${rooms.seated ?? 0}/${rooms.seats ?? 0}`));
    const list = make('div', 'admin-rooms');
    const matches = Array.isArray(data.matches) ? data.matches : [];
    if (!matches.length) list.append(make('p', 'empty-rooms', '열려 있거나 진행 중인 방이 없습니다.'));
    for (const room of matches) list.append(this.roomCard(room));
    if (data.truncated) list.append(make('p', 'admin-note', '방은 32개까지만 표시합니다.'));
    body.append(list);
    body.append(make('p', 'admin-note', '공개 방 목록은 대기실만 보여 줍니다. 이 화면은 진행 중 방과 로비·혼자 플레이까지 포함합니다.'));
  }

  roomCard(room) {
    const card = make('article', 'admin-room');
    const title = make('div', 'admin-room-title');
    title.append(make('strong', '', room.name || '방'), make('span', '', room.code || ''));
    const remain = Number.isFinite(room.endsInSeconds) ? `남은 ${duration(room.endsInSeconds)}` : room.phase === 'playing' ? '제한 없음' : '';
    const meta = [
      PHASES[room.phase] || room.phase,
      LABELS[room.mode] || room.mode,
      room.mode === 'custom' && room.format === 'ffa' ? '개인전' : room.mode === 'custom' ? '팀전' : '',
      room.city === 'procedural' ? '로컬 도시' : '홍콩',
      `${room.count ?? 0}/${room.capacity ?? 0}명`,
      room.enhanced ? '추격 확장' : '',
      room.round ? `${room.round}라운드` : '',
      remain,
      Number.isFinite(room.ageSeconds) ? `생성 ${duration(room.ageSeconds)}` : '',
      room.phase === 'finished' ? (room.winner === 'police' ? '경찰 승' : room.winner === 'runner' ? '도망자 승' : room.winner === 'draw' ? '무승부' : room.winner ? '승자 확정' : '') : '',
    ].filter(Boolean).join(' · ');
    card.append(title, make('p', 'admin-room-meta', meta), make('p', 'admin-room-meta', `방장 ${room.hostName || '알 수 없음'}`));
    const players = make('ul', 'admin-players');
    for (const player of room.players || []) {
      const item = make('li', '');
      const state = player.reconnecting ? '재접속 대기' : player.connected ? '연결' : '끊김';
      item.textContent = `${player.host ? '★ ' : ''}${player.name || '플레이어'} · ${TEAMS[player.team] || '플레이어'} · ${player.ready ? '준비' : '대기'} · HP ${player.health ?? '-'} · ${player.eliminated ? '탈락' : '생존'} · ${state}${Number.isFinite(player.idleSeconds) ? ` · 이동 ${duration(player.idleSeconds)} 전` : ''}`;
      players.append(item);
    }
    card.append(players);
    return card;
  }
}
