/* Transport and presentation only. Every permitted game action comes from server. */
(() => {
  const key = 'mahjong.lan.session.v040';
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { /* new session */ }
  let socket = null, state = null, retryTimer = null, retry = 0, stopped = false;
  let awaiting = false, joinBusy = false, firstState = true;
  const $ = id => document.getElementById(id);
  const hide = (id, value) => $(id).classList.toggle('hidden', value);
  const status = (text, kind = "") => {
    $('connectionStatus').textContent = text;
    $('connectionStatus').dataset.connection = kind;
  };
  function save(value) {
    saved = value;
    try {
      if (value) localStorage.setItem(key, JSON.stringify(value));
      else localStorage.removeItem(key);
    } catch (_) { showNotice('浏览器未允许保存身份，关闭页面后可能无法自动重连。'); }
  }
  function send(data) {
    if (socket?.readyState !== WebSocket.OPEN || !state) {
      showNotice('连接尚未恢复，请稍候。'); return;
    }
    if (awaiting) return;
    awaiting = true;
    decorate();
    socket.send(JSON.stringify(data));
  }
  function decorate() {
    for (const seat of [0,1,2,3]) {
      const el = $(`seat-${seat}`);
      el.classList.toggle('my-seat', state?.you.seat === seat);
      el.querySelectorAll('button').forEach(btn => {
        if (btn.dataset.actionKey || btn.classList.contains('clickable')) {
          btn.disabled = awaiting || socket?.readyState !== WebSocket.OPEN;
        }
      });
    }
    $('startGame').disabled = awaiting || !state?.controls.can_start;
    $('nextRound').disabled = awaiting || !state?.controls.can_next_round;
    $('leaveRoom').disabled = awaiting || socket?.readyState !== WebSocket.OPEN;
    $('roster').querySelectorAll('button').forEach(button => {
      const member = state?.room.members.find(player => player.seat === Number(button.dataset.chooseSeat));
      button.disabled = awaiting || !state?.controls.can_choose_seat || Boolean(member && member.member_id !== state.you.member_id);
    });
  }
  function renderRoom() {
    const {room, you, controls} = state;
    hide('joinPanel', true); hide('roomPanel', Boolean(state.player_view)); hide('leaveRoom', false);
    hide('gameTable', !state.player_view); hide('focusHand', !state.player_view);
    hide('waitingControls', room.started); hide('playingHint', !room.started);
    hide('nextRound', !controls.can_next_round);
    $('roomTitle').textContent = room.code;
    $('yourSeat').textContent = you.seat == null ? '请选择空位' : `你是${seatNames[you.seat]}家`;
    $('roster').innerHTML = [0,1,2,3].map(seat => {
      const member = room.members.find(p => p.seat === seat);
      const mine = member?.member_id === you.member_id;
      return seatChoiceMarkup(seat, member, mine);
    }).join('');
    $('roster').querySelectorAll('[data-choose-seat]').forEach(btn => btn.addEventListener('click', () => send({type:'choose_seat', seat:Number(btn.dataset.chooseSeat)})));
    const unseated = room.members.filter(p => p.seat == null).map(p => p.nickname).join('、');
    $('waitingHint').textContent = `${room.members.length}/4 人已加入。${unseated ? `尚未入座：${unseated}。` : ''}${controls.can_start ? '四人已在线入座，可以开始。' : '等待四人在线入座，由房主开始。'}`;
    decorate();
  }
  function connect() {
    if (!saved) return;
    clearTimeout(retryTimer);
    if (socket) { socket.onclose = null; socket.close(); }
    stopped = false; firstState = true; state = null; awaiting = false;
    hide('joinPanel', true);
    status('正在连接房间…', 'waiting');
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/${encodeURIComponent(saved.room_code)}`);
    socket = ws;
    ws.onopen = () => ws.send(JSON.stringify({type:'authenticate', session_token:saved.session_token}));
    ws.onmessage = event => {
      if (socket !== ws) return;
      let message;
      try { message = JSON.parse(event.data); } catch (_) { showNotice('收到了无法识别的消息。'); return; }
      if (message.type === 'error') {
        awaiting = false; showNotice(message.error);
        if (message.invalid_session) {
          stopped = true; save(null); ws.close(); state = null;
          hide('playingHint', true); status('尚未连接');
          hide('joinPanel', false); hide('roomPanel', true); hide('gameTable', true);
          hide('resumeRoom', true); hide('leaveRoom', true); hide('nextRound', true); hide('focusHand', true);
        }
        decorate(); return;
      }
      if (message.type === 'left') {
        stopped = true; awaiting = false; ws.close(); state = null; table = null;
        if (!message.resumable) save(null);
        hide('joinPanel', false); hide('roomPanel', true); hide('gameTable', true);
        hide('leaveRoom', true); hide('nextRound', true); hide('focusHand', true); hide('resumeRoom', !saved);
        hide('playingHint', true);
        window.MahjongPresentation?.audio.stopBgm();
        status('已离开');
        showNotice(message.resumable ? '座位仍为你保留。点击“返回原房间”可以继续，其他玩家会看到你已断线。' : '已离开房间。');
        return;
      }
      if (message.type !== 'state') return;
      if (state && message.room_version < state.room_version) return;
      if (firstState) showNotice('');
      state = message; awaiting = false; retry = 0;
      status(`房间 ${state.room.code} · 已连接`, 'online');
      renderRoom();
      if (message.player_view) {
        // Adapt only the shape expected by the shared renderer. No rule inference.
        const view = message.player_view;
        window.MahjongView?.setViewerSeat(state.you.seat);
        acceptTable({...view, legal_actions:{[String(state.you.seat)]:view.legal_actions}}, {initial:firstState});
      }
      firstState = false;
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      awaiting = false; decorate();
      if (stopped || !saved) return;
      status('连接中断，正在自动重连…', 'offline');
      showNotice('网络连接中断；座位和牌局保留，恢复连接后继续。');
      hide('joinPanel', false); hide('resumeRoom', false);
      retryTimer = setTimeout(connect, Math.min(8000, 700 * (2 ** retry++)));
    };
    ws.onerror = () => { status('暂时无法连接服务器', 'offline'); };
  }
  async function join(create) {
    if (joinBusy) return;
    const name = $('nickname').value.trim();
    if (!name) { showNotice('请先输入昵称。'); $('nickname').focus(); return; }
    if (saved && !confirm('你还有一个可恢复的房间身份。继续会用新身份加入，原座位可能无法恢复，确定继续吗？')) return;
    joinBusy = true;
    $('createRoom').disabled = $('joinRoom').disabled = true;
    try {
      const payload = create ? {nickname:name} : {nickname:name, room_code:$('roomCode').value.trim().toUpperCase()};
      const res = await fetch(create ? '/api/rooms' : '/api/rooms/join', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || '加入失败');
      stopped = true; clearTimeout(retryTimer);
      if (socket) { socket.onclose = null; socket.close(); }
      save({room_code:data.room_code, session_token:data.session_token});
      showNotice(''); connect();
    } catch (e) { showNotice(e.message); }
    finally { joinBusy = false; $('createRoom').disabled = $('joinRoom').disabled = false; }
  }
  window.LanGame = {
    decorate,
    act(action) {
      if (!state?.player_view) return;
      showNotice('');
      send({type:'action', intent:{round_id:state.player_view.round_id, revision:state.player_view.revision, type:action.type, tile_ids:action.tile_ids}});
      selected = {seat:null, tileId:null};
    }
  };
  $('createRoom').addEventListener('click', () => join(true));
  $('joinRoom').addEventListener('click', () => join(false));
  $('resumeRoom').addEventListener('click', connect);
  $('startGame').addEventListener('click', () => send({type:'start'}));
  $('nextRound').addEventListener('click', () => {
    if (state?.player_view) send({type:'next_round', round_id:state.player_view.round_id, revision:state.player_view.revision});
  });
  $('leaveRoom').addEventListener('click', () => {
    if (state?.room.started && !confirm('离开后仍保留你的座位，牌局可能等待你回来。确定暂时离开吗？')) return;
    send({type:'leave'});
  });
  $('focusHand').addEventListener('click', () => scrollToSeat(state?.you.seat));
  $('roomCode').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) join(false);
  });
  window.addEventListener('online', () => { if (!stopped && saved && socket?.readyState !== WebSocket.OPEN) connect(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !stopped && saved && socket?.readyState === WebSocket.CLOSED) connect();
  });
  (async () => {
    await window.MahjongPresentation?.init();
    if (saved?.room_code && saved?.session_token) connect();
    else save(null);
  })();
})();
