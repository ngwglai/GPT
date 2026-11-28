/* Qingque 0.9.3 — one shared planar homography for every tabletop object.
 * Engine state is laid out in a square logical table, then projected as a single
 * 2D plane. Concealed information remains concealed; motion keys stay stable. */
const MahjongScene = (() => {
  const winds = ["东", "南", "西", "北"];
  const flights = new Set();
  const labels = {meld:"副露",shelf:"上金",orphan:"拾牌",ting:"报听"};
  const keyOfWall = p => `wall-${p.side}-${p.column}-${p.layer === 0 || p.layer === 'top' ? 'top' : 'bottom'}`;
  const escape = text => esc(text == null ? "" : text);
  function face(type, {gold=false, back=false, cls="", motion="", label=""}={}) {
    const invisible = back || type == null;
    const name = label || (invisible ? "暗牌" : tileName(type));
    const art = window.MahjongPresentation?.assets?.resolve?.("tiles", String(type)) || `/assets/tiles/${type}.svg`;
    const content = invisible ? '<span class="v09-back-mark" aria-hidden="true">❀</span>' :
      `<img class="v09-face-art" src="${escape(art)}" alt="" draggable="false"><span class="v09-fallback">${escape(name)}</span>`;
    return `<span class="v09-card scene-tile ${invisible ? 'v09-card-back tile-back' : ''} ${gold?'gold':''} ${cls}" title="${escape(name)}" data-tile-face="${invisible ? '' : type}"${motion?` data-motion="${escape(motion)}"`:''}>${content}</span>`;
  }
  function meldOrder(seat, meld) {
    const tiles = (meld.tiles || Array(meld.count).fill(null)).map(type=>({type,sideways:false}));
    if (meld.source == null || !tiles.length) return tiles;
    // The source is expressed in the owner's seat-relative order:
    // 1 = player on the right, 2 = opposite, 3 = player on the left.
    const source = (meld.source - seat + 4) % 4;
    const added = meld.type === 'BU_GANG' ? tiles.pop() : null;
    const claimed = tiles.pop();
    if (meld.type === 'CHI') {
      // A chi's called tile belongs at its numeric sequence position, not at
      // the left/right edge of the meld. The source seat only controls its turn.
      const ordered = [...tiles, claimed].sort((a,b)=>(a.type ?? -1)-(b.type ?? -1));
      claimed.sideways = true;
      claimed.sourceRelative = source;
      return ordered;
    }
    claimed.sideways = true;
    claimed.sourceRelative = source;
    const at = source === 3 ? 0 : source === 2 ? 1 : tiles.length;
    tiles.splice(at, 0, claimed);
    // A bu-gang tile is visually stacked on the called tile. Keep the same
    // source metadata so every seat can orient the pair consistently.
    if (added) tiles.splice(at + 1, 0, {...added, sideways:true, stacked:true, sourceRelative:source});
    return tiles;
  }
  function wall(table,seat,side) {
    const stacks = table.wall_view?.sides?.[seat] || [];
    const content = stacks.map(stack=>{
      const col = stack.column;
      const tiles = ['bottom','top'].flatMap(layer=>{
        const slot = stack[layer];
        if (!slot?.present) return [];
        const tileType = slot.indicator ? table.gold_indicator?.type : null;
        const classes = ['wall-layer','present',slot.reserved&&'reserved',slot.indicator&&'indicator',slot.normal_cursor&&'normal-cursor',slot.gang_cursor&&'gang-cursor'].filter(Boolean).join(' ');
        const label = slot.indicator ? '金指示牌' : slot.normal_cursor ? '下一张摸牌' : slot.gang_cursor ? '杠后补牌端' : '牌墙';
        return face(tileType,{back:tileType==null,cls:classes, motion:`wall-${seat}-${col}-${layer}`,label});
      }).join('');
      return `<span class="v09-wall-stack" data-column="${col}">${tiles}</span>`;
    }).join('');
    const bp=table.wall_view?.break_position;
    const marker=bp?.side===seat ? `<span class="v09-wall-break" title="${escape(winds[seat])}家${bp.column}号墩开墙">✦ 开墙</span>` : '';
    return `<div class="v09-wall v09-wall-${side}" aria-label="${winds[seat]}家牌墙">${content}${marker}</div>`;
  }
  function enemyHand(table,seat,side) {
    const p=table.players[seat];
    const count=Array.isArray(p.concealed_tiles)?p.concealed_tiles.length:(p.concealed_count||0);
    if (!count) return '';
    const revealed = table.phase === 'ROUND_END' && Array.isArray(p.concealed_tiles)
      ? [...p.concealed_tiles].sort((a,b) => a.type-b.type || a.id-b.id) : null;
    const cards = Array.from({length:count}, (_,i) => {
      const type = revealed?.[i]?.type ?? null;
      const tile = face(type, {back:type==null, gold:type===table.gold_tile_type, cls:'scene-hand',
        motion:revealed ? `hand-${seat}-${revealed[i].id}` : `opponent-${seat}-${i}`});
      // East/West cells reserve the rotated tile's *visual* dimensions. This
      // prevents a 90-degree transform from making adjacent backs overlap.
      return side === 'east' || side === 'west' ? `<span class="v092-hand-cell">${tile}</span>` : tile;
    }).join('');
    return `<div class="v09-enemy-hand v09-enemy-${side}" aria-label="${winds[seat]}家${revealed ? '亮牌' : '暗牌'}，共${count}张">${cards}</div>`;
  }
  function river(table,seat,side) {
    const tiles=(table.discards||[]).map((discard,index)=>({...discard,index})).filter(d=>d.seat===seat && !d.claimed);
    const waiting=table.pending_claim?.kind==='DISCARD'&&table.pending_claim.source===seat;
    const content=tiles.map((d,i)=>{
      const tile=face(d.type,{gold:d.type===table.gold_tile_type,cls:`scene-river${waiting&&i===tiles.length-1?' recent':''}`,motion:`discard-${d.index}`});
      return side==='east'||side==='west' ? `<span class="v092-river-cell">${tile}</span>` : tile;
    }).join('');
    return `<div class="v09-river v09-river-${side}${tiles.length>22?' crowded':''}${tiles.length>34?' dense':''} scene-river-side river-${side}" data-river-seat="${seat}" aria-label="${winds[seat]}家牌河，共${tiles.length}张">${content}</div>`;
  }
  function exposed(table,seat,side) {
    const p=table.players[seat]; if (!p) return '';
    const groups=[];
    for(const [i,meld] of (p.melds||[]).entries()){
      const cards=meldOrder(seat,meld).map(({type,sideways,stacked,sourceRelative},j)=>{
        const sourceClass=sideways?` source-${sourceRelative===1?'right':sourceRelative===2?'across':'left'}`:'';
        const cellClass=`v092-meld-cell${sideways?' is-claimed':''}${stacked?' is-stacked':''}`;
        const card=face(type,{back:type==null,gold:type===table.gold_tile_type,
          cls:`scene-meld${sideways?' scene-claimed':''}${stacked?' scene-stacked':''}${sourceClass}`,motion:`meld-${seat}-${i}-${j}`});
        return `<span class="${cellClass}">${card}</span>`;
      }).join('');
      groups.push(`<span class="v09-exposed-set v092-meld-set" title="副露 ${escape(meld.type)}">${cards}</span>`);
    }
    for(const [cat,tiles] of [
      ['shelf',(p.shelf_tiles||[]).map((type,i)=>({type,i}))],
      ['orphan',(p.picked_orphans||[]).map((type,i)=>({type,i}))],
      ['ting',p.ting_tile?[{type:p.ting_tile.hidden?null:p.ting_tile.type,i:0}]:[]]
    ]){
      if(!tiles.length)continue;
      groups.push(`<span class="v09-exposed-set v09-${cat}" title="${labels[cat]}">${tiles.map(({type,i})=>face(type,{back:type==null,gold:cat==='shelf'||type===table.gold_tile_type,cls:`scene-${cat}`,motion:`${cat}-${seat}-${i}`})).join('')}</span>`);
    }
    return groups.length?`<div class="v09-exposed v09-exposed-${side}" aria-label="${winds[seat]}家公开区域">${groups.join('')}</div>`:'';
  }
  function centerpiece(table,layout) {
    const phase=table.phase;
    const round=table.match?.round_no??1;
    const remaining=table.normal_tiles_remaining??'—';
    const active=phase==='ROLLING_DICE'?table.dealer:table.current_player;
    const windPill=side=>{
      const seat=layout[side];const score=table.match?.scoring?.totals?.[String(seat)];
      return `<span class="v09-compass-${side}${active===seat&&phase!=='ROUND_END'?' on':''}" title="${winds[seat]}家${score==null?'':` ${score}分`}">${winds[seat]}</span>`;
    };
    const gold=phase==='ROLLING_DICE'||table.gold_tile_type==null?'':
      `<div class="v091-gold-corner" aria-label="金牌 ${escape(tileName(table.gold_tile_type))}"><span>金</span>${face(table.gold_tile_type,{gold:true,motion:'gold'})}</div>`;
    const dice=(table.dice||[]).length?`<div class="v09-dice">${table.dice.map(x=>`<span aria-label="骰子${x}">${escape(x)}</span>`).join('')}</div>`:'';
    return `<div class="v09-center-widget" aria-label="本局计分及风位">
      ${windPill('north')}${windPill('west')}${windPill('east')}${windPill('south')}
      ${gold}
      <div class="v09-center-content"><span class="v09-center-eyebrow">東風戦 · ROUND ${round}</span><b>第 ${round} 局</b><div class="v09-center-rule"></div><span>余 <strong>${remaining}</strong> 张</span>${dice}</div>
    </div>`;
  }
  function markup(table,layout){
    const positions=Object.entries(layout);
    return `<div class="wall-stage v09-stage" aria-label="纯2D透视青雀麻将牌桌">
      <div class="v09-board" role="group" aria-label="四家牌墙、牌河与公开牌">
        <div class="v092-board-surface" aria-hidden="true"></div>
        <div class="v09-felt-crest" aria-hidden="true">❀<span>QINGQUE</span>❀</div>
        <div class="v09-felt-guide" aria-hidden="true"></div>
        ${positions.map(([side,seat])=>wall(table,seat,side)+enemyHand(table,seat,side)+river(table,seat,side)+exposed(table,seat,side)).join('')}
        ${centerpiece(table,layout)}
        ${table.phase==='ROLLING_DICE'?'<div class="scene-deal v09-deal">请庄家掷骰开局</div>':''}
      </div>
    </div>`;
  }
  function restoreHand(shell){
    if(!shell)return;
    for(const hand of shell.querySelectorAll('.v093-projected-hand')){
      const owner=shell.querySelector(`#seat-${Number(hand.dataset.handSeat)}`);
      if(!owner){hand.remove();continue;}
      const fresh=owner.querySelector('.hand:not(.v093-projected-hand)');
      if(fresh&&fresh!==hand){hand.remove();continue;}
      hand.classList.remove('v093-projected-hand');
      owner.appendChild(hand);
    }
  }
  function mount(shell){
    if(!shell)return;
    shell.classList.add('v09-layout','v093-projection-active');
    const board=shell.querySelector('.v09-board');
    const dock=shell.querySelector('.player.dock-seat');
    if(board&&dock){
      const activeSeat=Number(dock.id.replace('seat-',''));
      // If the inspected/docked seat changes, return the previous live hand to
      // its owner before projecting the newly active seat's hand.
      for(const previous of board.querySelectorAll('.v093-projected-hand')){
        const owner=shell.querySelector(`#seat-${Number(previous.dataset.handSeat)}`);
        if(!owner){previous.remove();continue;}
        const fresh=owner.querySelector('.hand:not(.v093-projected-hand)');
        if(fresh&&fresh!==previous){previous.remove();continue;}
        previous.classList.remove('v093-projected-hand');
        owner.appendChild(previous);
      }
      // Move the existing button DOM (not a clone), preserving tile IDs,
      // keyboard focus, event delegation and accessibility semantics.
      const hand=dock.querySelector('.hand');
      if(hand){
        hand.dataset.handSeat=String(activeSeat);
        hand.classList.add('v093-projected-hand');
        if(hand.parentElement!==board)board.appendChild(hand);
      }
    }
    const update=()=>{
      const current=shell.querySelector('.v09-board');
      if(current)window.MahjongProjection?.apply(current,shell);
    };
    update();
    if(!shell.__v093ResizeBound){
      shell.__v093ResizeBound=true;
      window.addEventListener('resize',update,{passive:true});
      window.visualViewport?.addEventListener('resize',update,{passive:true});
    }
  }
  function setPerspective(shell){
    // The alternate view is a true top-down identity mapping of the same 2D plane.
    return shell.classList.toggle('overhead-view');
  }
  function cancelFlights(){for(const a of flights){try{a.cancel();}catch(_){}}flights.clear();}
  function snapshot(events){
    if(typeof Element==='undefined'||typeof Element.prototype.animate!=='function'||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return null;
    const map=new Map();
    for(const node of document.querySelectorAll('.table-shell [data-motion]')){
      const rect=node.getBoundingClientRect();if(!rect.width||!rect.height)continue;
      map.set(node.dataset.motion,{node,rect});
      if(node.dataset.lastHand!=null)map.set(`last-${node.dataset.lastHand}`,{node,rect});
    }
    return map;
  }
  function animate(events,before,previous,next){
    if(!events.length||!before||!previous||!next||document.hidden)return;
    const after=snapshot(events);if(!after)return;
    const moved=next.discards.slice(previous.discards.length);
    for(const event of events){
      let from,to;
      const p=event.payload||{};const seat=event.player;
      if(event.type==='TILE_DISCARDED'){
        const item=moved.find(x=>x.seat===seat&&x.type===p.tile_type);
        if(item){const index=next.discards.indexOf(item);to=after.get(`discard-${index}`);}
        const prior=previous.players[seat]?.concealed_tiles||[];
        const current=new Set((next.players[seat]?.concealed_tiles||[]).map(x=>x.id));
        const old=prior.find(x=>x.type===p.tile_type&&!current.has(x.id));
        from=before.get(`hand-${seat}-${old?.id}`)||before.get(`last-${seat}`);
      }else if(event.type==='TILE_DRAWN'){
        from=p.position?before.get(keyOfWall(p.position)):null;
        to=after.get(`last-${seat}`);
      }else if(event.type==='GOLD_SHELVED'){
        to=after.get(`shelf-${seat}-${(next.players[seat]?.shelf_count||1)-1}`);
      }else if(event.type==='ORPHAN_PICKED'){
        to=after.get(`orphan-${seat}-${(next.players[seat]?.picked_orphans||[]).length-1}`);
      }
      if(!to?.node?.animate)continue;
      const a=to.rect,b=from?.rect;
      const x=b?(b.left+b.width/2-a.left-a.width/2):0;
      const y=b?(b.top+b.height/2-a.top-a.height/2):16;
      try{
        const flight=to.node.animate([{translate:`${x}px ${y}px`,scale:.75,opacity:.55},
          {translate:'0px 0px',scale:1,opacity:1}],{duration:250,easing:'cubic-bezier(.2,.65,.25,1)'});
        flights.add(flight);flight.onfinish=()=>flights.delete(flight);flight.oncancel=()=>flights.delete(flight);
      }catch(_){}
    }
  }
  return {markup,meldOrder,mount,restoreHand,setPerspective,snapshot,animate,cancelFlights};
})();
