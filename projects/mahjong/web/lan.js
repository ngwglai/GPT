/* Transport and presentation only. Every permitted game action comes from server. */
(() => {
  const key = 'mahjong.lan.session.v040';
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { /* new session */ }
  let socket = null, state = null, retryTimer, retry = 0, stopped = false;
  let authenticated = false, pending = null, commandId = 0, joinBusy = false;
  let lastSeen = 0, pendingAt = 0, lobbyBusy = false, resetBusy = false;
  const STALE_MS = 20000;
  const $ = id => document.getElementById(id);
  const hide = (id, value) => $(id).classList.toggle('hidden', value);
  const status = (text, kind = "") => {
    $('connectionStatus').textContent = text;
    $('connectionStatus').dataset.connection = kind;
  };
  const ready = () => authenticated && socket?.readyState === WebSocket.OPEN;
  function save(value) {
    saved = value;
    hide('roomManagement', !saved);
    try {
      if (value) localStorage.setItem(key, JSON.stringify(value));
      else localStorage.removeItem(key);
    } catch (_) { showNotice('浏览器未允许保存身份，关闭页面后可能无法自动重连。'); }
  }
  function send(data) {
    if (!ready() || !state) {
      showNotice('连接尚未恢复，请稍候。'); return;
    }
    if (pending !== null) return;
    pending = ++commandId;
    pendingAt = Date.now();
    try { socket.send(JSON.stringify({...data, command_id:pending})); }
    catch (_) { disconnect(socket); }
    decorate();
  }
  function decorate() {
    const locked = pending !== null || !ready();
    for (const seat of [0,1,2,3]) {
      const el = $(`seat-${seat}`);
      el.classList.toggle('my-seat', state?.you.seat === seat);
      el.querySelectorAll('button').forEach(btn => {
        if (btn.dataset.actionKey || btn.hasAttribute('data-orphan-pickup') || btn.hasAttribute('data-ai-toggle') || btn.classList.contains('clickable')) {
          btn.disabled = locked || Boolean(state?.room.paused);
        }
      });
    }
    $('controlSettings').querySelectorAll('select, input[data-auto-ting]').forEach(select => {
      select.disabled = locked;
    });
    $('startGame').disabled = locked || !state?.controls.can_start;
    $('startAI').disabled = locked || !state?.controls.can_start_ai;
    $('releaseRoom').disabled = locked;
    $('forceReconnect').disabled = resetBusy || !saved;
    $('hostManagement').querySelectorAll('button, select').forEach(el => { el.disabled = locked; });
    $('nextRound').disabled = locked || !state?.controls.can_next_round || Boolean(state?.room.paused);
    $('leaveRoom').disabled = locked;
    $('roster').querySelectorAll('button').forEach(button => {
      const member = state?.room.members.find(player => player.seat === Number(button.dataset.chooseSeat));
      button.disabled = locked || !state?.controls.can_choose_seat || Boolean(member && member.member_id !== state.you.member_id);
    });
  }
  function renderRoom() {
    const {room, you, controls} = state;
    hide('joinPanel', true); hide('roomPanel', Boolean(state.player_view)); hide('leaveRoom', false);
    hide('gameTable', !state.player_view); hide('focusHand', !state.player_view);
    hide('waitingControls', room.started); hide('playingHint', !room.started);
    hide('nextRound', !controls.can_next_round);
    const count = controls.ready_seats?.length || 0;
    const mineReady = controls.ready_seats?.includes(you.seat);
    const allManaged = count === 4;
    $('nextRound').textContent = allManaged ? '开始下一局 (4/4)' : mineReady ? `取消准备 (${count}/4)` : `准备下一局 (${count}/4)`;
    $('roomTitle').textContent = room.code;
    $('roomScoreMode').textContent = `${room.name || '麻将房间'} · 基础分：${room.base_score ?? 1} 分`;
    $('yourSeat').textContent = you.seat == null ? '请选择空位' : `你是${seatNames[you.seat]}家`;
    $('roster').innerHTML = [0,1,2,3].map(seat => {
      const member = room.members.find(p => p.seat === seat);
      const mine = member?.member_id === you.member_id;
      return seatChoiceMarkup(seat, member, mine);
    }).join('');
    $('roster').querySelectorAll('[data-choose-seat]').forEach(btn => btn.addEventListener('click', () => send({type:'choose_seat', seat:Number(btn.dataset.chooseSeat)})));
    const unseated = room.members.filter(p => p.seat == null).map(p => p.nickname).join('、');
    $('waitingHint').textContent = `${room.members.length}/4 人已加入。${unseated ? `尚未入座：${unseated}。` : ''}${controls.can_start ? '四人已在线入座，可以开始。' : '等待入座，也可由 AI 补齐空位。'}`;
    hide('roomManagement', false);
    renderManagement();
    decorate();
  }
  function controlButton(label, callback) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'ghost'; btn.textContent = label;
    btn.addEventListener('click', callback); return btn;
  }
  function renderManagement() {
    const root = $('hostManagement');
    root.replaceChildren();
    if (!state?.controls.can_manage) return;
    const {room, you} = state;
    if (room.started) {
      root.append(controlButton(room.paused ? '恢复牌局' : '暂停牌局',
        () => send({type:'pause', enabled:!room.paused})));
    }
    for (const p of room.members) {
      if (p.member_id === you.member_id) continue;
      const label = (p.seat == null ? '未入座' : seatNames[p.seat]+'家')+' '+p.nickname+(p.connected?'（在线）':'（离线）');
      root.append(controlButton('移除 '+label, () => {
        if (confirm('确定释放该玩家的座位？原身份将失效。')) send({type:'remove_member', member_id:p.member_id});
      }));
    }
    root.append(controlButton('删除本房间', () => {
      if (confirm('确定删除房间和当前牌局？')) send({type:'delete_room'});
    }));
    if (room.started) for (let seat=0; seat<4; seat++) {
      if (room.members.some(p=>p.seat===seat)) continue;
      const mode = room.vacant_controls?.[seat] || 'human';
      root.append(controlButton(seatNames[seat]+'家空位：'+(mode==='human'?'启用 AI':'停止 AI'),
        () => send({type:'vacant_control',seat,mode:mode==='human'?'easy':'human'})));
    }
  }
  async function refreshLobby() {
    if (lobbyBusy || $('joinPanel').classList.contains('hidden')) return;
    lobbyBusy = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch('/api/rooms', {signal:controller.signal});
      const data = await res.json();
      if (!window.document) return;
      if (!res.ok || !data.ok) throw Error('大厅暂不可用');
      $('lobbyStatus').textContent = '公开房间 '+data.rooms.length+' · 在线玩家 '+data.online;
      const root = $('publicRooms'); root.replaceChildren();
      for (const room of data.rooms) {
        const row = document.createElement('div'); row.className='public-room-row';
        const title = document.createElement('span');
        title.textContent = room.name+' · '+room.code+' · '+room.players+'/4 人 · AI '+room.ai+' · '+room.base_score+'分 · '+(room.started?(room.paused?'已暂停':'对局中'):'等待中');
        const btn = controlButton(room.players>=4?'已满':room.started?'接管空位':'加入', () => {
          $('roomCode').value=room.code; $('roomPassword').value=''; join(false);
        });
        btn.disabled = room.players>=4; row.append(title,btn); root.append(row);
      }
    } catch (_) { if (window.document) $('lobbyStatus').textContent = '大厅列表暂不可用，可刷新或输入房间号。'; }
    finally { clearTimeout(timeout); lobbyBusy=false; }
  }
  async function forceReconnect() {
    if (!saved || resetBusy) return;
    resetBusy=true; decorate();
    const session=saved;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(), 8000);
    try {
      await fetch('/api/connections/reset', {method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify(session), signal:controller.signal});
    } catch (_) { /* Always try local recovery even when HTTP reset cannot be reached. */ }
    finally {
      clearTimeout(timeout); resetBusy=false;
      if (saved === session) {
        const old=socket; socket=null; authenticated=false; pending=null; stopped=false;
        try { old?.close(); } catch (_) {}
        connect();
      }
      decorate();
    }
  }
  function disconnect(ws) {
    if (!ws || socket !== ws) return;
    socket = null; authenticated = false; pending = null;
    try { ws.close(); } catch (_) { /* already disconnected */ }
    decorate();
    if (stopped || !saved) return;
    status('连接中断，正在自动重连…', 'offline');
    showNotice('网络连接中断；座位和牌局保留，恢复连接后继续。');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, Math.min(8000, 700 * (2 ** Math.min(retry++, 4))));
  }
  function checkConnection() {
    if (stopped || !saved) return;
    if (!socket) {
      // Keep the backoff timer; online/visibility also checks live connections.
      if (!retryTimer) connect();
      return;
    }
    const now = Date.now();
    if (socket.readyState >= WebSocket.CLOSING || now - lastSeen >= STALE_MS ||
        (pending !== null && now - pendingAt >= STALE_MS)) {
      disconnect(socket);
      return;
    }
    if (ready()) {
      try { socket.send(JSON.stringify({type:'ping'})); }
      catch (_) { disconnect(socket); }
    }
  }
  function connect() {
    clearTimeout(retryTimer); retryTimer = null;
    if (!saved || stopped || (socket && socket.readyState < WebSocket.CLOSING)) return;
    clearTimeout(retryTimer);
    authenticated = false;
    pending = null;
    const session = saved;
    hide('joinPanel', true);
    status(state ? '正在恢复连接…' : '正在连接房间…', 'waiting');
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/${encodeURIComponent(session.room_code)}`);
    socket = ws;
    lastSeen = Date.now();
    ws.onopen = () => {
      if (socket !== ws) return;
      try { ws.send(JSON.stringify({type:'authenticate', session_token:session.session_token})); }
      catch (_) { disconnect(ws); }
    };
    ws.onmessage = event => {
      if (socket !== ws) return;
      let message;
      try { message = JSON.parse(event.data); } catch (_) { showNotice('收到了无法识别的消息。'); return; }
      lastSeen = Date.now();
      if (message.type === 'pong') return;
      if (message.type === 'command_ack') {
        if (message.command_id === pending) { pending = null; decorate(); }
        return;
      }
      if (message.type === 'error') {
        pending = null; showNotice(message.error);
        if (message.invalid_session) {
          stopped = true; save(null); ws.close(); state = null; table = null;
          hide('tableHud', true); hide('controlMenu', true); document.body.classList.remove('table-live');
          hide('playingHint', true); status('尚未连接');
          hide('joinPanel', false); hide('roomPanel', true); hide('gameTable', true);
          hide('resumeRoom', true); hide('leaveRoom', true); hide('nextRound', true); hide('focusHand', true);
          $('hostManagement').replaceChildren(); refreshLobby();
        }
        decorate(); return;
      }
      if (message.type === 'left') {
        stopped = true; pending = null; ws.close(); state = null; table = null;
        if (!message.resumable) save(null);
        hide('joinPanel', false); hide('roomPanel', true); hide('gameTable', true);
        hide('leaveRoom', true); hide('nextRound', true); hide('focusHand', true); hide('resumeRoom', !saved);
        hide('roomManagement', true); $('hostManagement').replaceChildren(); refreshLobby();
        hide('playingHint', true); hide('tableHud', true); hide('controlMenu', true); document.body.classList.remove('table-live');
        window.MahjongPresentation?.audio.resetVoice();
        window.MahjongPresentation?.audio.stopBgm();
        status('已离开');
        showNotice(message.resumable ? '座位仍为你保留。点击“返回原房间”可以继续，其他玩家会看到你已断线。' : '已离开房间。');
        return;
      }
      if (message.type !== 'state') return;
      if (state && message.room_version < state.room_version) return;
      const firstState = !authenticated;
      if (firstState) showNotice('');
      state = message; authenticated = true; retry = 0;
      status(`房间 ${state.room.code} · ${state.room.paused && state.room.started ? '已暂停' : '已连接'}`, 'online');
      renderRoom();
      if (message.player_view) {
        // Adapt only the shape expected by the shared renderer. No rule inference.
        const view = message.player_view;
        window.MahjongView?.setViewerSeat(state.you.seat);
        acceptTable({...view, legal_actions:{[String(state.you.seat)]:view.legal_actions}}, {initial:firstState});
      }
    };
    ws.onclose = () => disconnect(ws);
    ws.onerror = () => disconnect(ws);
  }
  async function join(create) {
    if (joinBusy) return;
    const name = $('nickname').value.trim();
    if (!name) { showNotice('请先输入昵称。'); $('nickname').focus(); return; }
    if (saved && !confirm('你还有一个可恢复的房间身份。继续会用新身份加入，原座位可能无法恢复，确定继续吗？')) return;
    joinBusy = true;
    $('createRoom').disabled = $('joinRoom').disabled = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const password = $('roomPassword').value;
      const payload = create ? {nickname:name, base_score:Number($('roomBaseScore').value), name:$('roomName').value.trim(), password} : {nickname:name, room_code:$('roomCode').value.trim().toUpperCase(), password};
      const res = await fetch(create ? '/api/rooms' : '/api/rooms/join', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), signal:controller.signal});
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || '加入失败');
      clearTimeout(retryTimer);
      const previous = socket;
      socket = null;
      previous?.close();
      state = null; pending = null; stopped = false;
      save({room_code:data.room_code, session_token:data.session_token});
      showNotice(''); connect();
    } catch (e) { showNotice(e.name === 'AbortError' ? '请求超时，请检查连接后再试。' : e.message); }
    finally { clearTimeout(timeout); joinBusy = false; $('createRoom').disabled = $('joinRoom').disabled = false; }
  }
  window.LanGame = {
    decorate,
    setAutoTing(enabled) {
      if (!state?.player_view) return;
      send({type:'auto_ting', round_id:state.player_view.round_id, enabled});
    },
    setController(mode) {
      if (!state?.player_view) return;
      showNotice('');
      send({type:'control', round_id:state.player_view.round_id, mode});
    },
    setOrphanPickup(enabled) {
      if (!state?.player_view) return;
      showNotice('');
      send({type:'orphan_pickup', round_id:state.player_view.round_id, enabled});
    },
    act(action) {
      if (!state?.player_view) return;
      showNotice('');
      send({type:'action', intent:{round_id:state.player_view.round_id, revision:state.player_view.revision, type:action.type, tile_ids:action.tile_ids}});
      selected = {seat:null, tileId:null};
    }
  };
  $('createRoom').addEventListener('click', () => join(true));
  $('joinRoom').addEventListener('click', () => join(false));
  $('resumeRoom').addEventListener('click', () => { stopped = false; connect(); });
  $('startGame').addEventListener('click', () => send({type:'start'}));
  $('startAI').addEventListener('click', () => send({type:'start_ai'}));
  $('refreshRooms').addEventListener('click', refreshLobby);
  $('forceReconnect').addEventListener('click', forceReconnect);
  $('releaseRoom').addEventListener('click', () => {
    if (confirm('确定退出并释放座位？其他人可以接管当前手牌，原身份将失效。')) send({type:'release'});
  });
  $('nextRound').addEventListener('click', () => {
    if (state?.player_view) send({type:'ready_next_round', round_id:state.player_view.round_id,
      enabled:state.controls.ready_seats?.length === 4 || !state.controls.ready_seats?.includes(state.you.seat)});
  });
  $('leaveRoom').addEventListener('click', () => {
    if (state?.room.started && !confirm('离开后仍保留你的座位，牌局可能等待你回来。确定暂时离开吗？')) return;
    send({type:'leave'});
  });
  $('focusHand').addEventListener('click', () => scrollToSeat(state?.you.seat));
  $('roomCode').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) join(false);
  });
  window.addEventListener('online', checkConnection);
  window.addEventListener('offline', () => disconnect(socket));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkConnection();
  });
  window.addEventListener('pageshow', event => { if (event.persisted) checkConnection(); });
  setInterval(checkConnection, 5000);
  setInterval(refreshLobby, 5000);
  (async () => {
    await window.MahjongPresentation?.init();
    await window.MahjongCuboid?.preload();
    if (saved?.room_code && saved?.session_token) { hide('roomManagement', false); connect(); }
    else { save(null); refreshLobby(); }
  })();
})();
