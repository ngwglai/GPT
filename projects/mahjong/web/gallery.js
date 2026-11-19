(async () => {
  await window.MahjongPresentation.init();
  const show = (id, html) => { document.getElementById(id).innerHTML = html; };
  const tiles = (first, last) => Array.from({length:last - first + 1}, (_, i) => {
    const kind = first + i;
    return `<figure>${tileHTML(kind)}<figcaption>${tileName(kind)}</figcaption></figure>`;
  }).join("");
  const groups = [["万子",0,8], ["筒子",9,17], ["条子",18,26], ["风牌与三元牌",27,33]];
  show("catalog", groups.map(([name, first, last]) =>
    `<div><h3>${name}</h3><div class="tile-group">${tiles(first,last)}</div></div>`).join(""));
  show("specialTiles", `${tileBackHTML()} ${tileHTML(13,{small:true,gold:true})}`);
  show("diceSamples", Array.from({length:6}, (_, i) => diceFaceHTML(i + 1)).join(""));
  show("badgeSamples", [
    badge("庄","dealer"), badge("已听","ting"), badge("已上金","gold-ok"), badge("你","self"),
    badge("房主","dealer","host"), badge("在线","online","online"), badge("断线","offline","offline"),
  ].join(""));
  const icons = [["bird","青雀标识"],["people","联机"],["tiles","牌桌"],["sound","声音"],["settings","设置"],["result","结算"]];
  show("iconSamples", icons.map(([name,label]) => `<span class="icon-sample">${icon(name)}${label}</span>`).join(""));
  show("seatSamples", [
    seatChoiceMarkup(0,{nickname:"松风",host:true,connected:true},true,true),
    seatChoiceMarkup(1,{nickname:"山茶",connected:false},false,true),
    seatChoiceMarkup(2,null,false,true),
  ].join(""));
  show("hudSample", statusCard([["牌局","第 2 局"],["当前阶段","响应阶段"],["当前玩家","东家"],["墙上实牌",72],["本局杠数",1]]));
  show("phoneSample", `<article class="player south active my-seat">
    <div class="player-head"><div class="player-title"><span class="wind">东</span><div class="player-identity">
      <strong>松风</strong><div class="player-sub">手牌 10 张</div>
    </div></div><div class="player-badges">${badge("庄","dealer")}${badge("你","self")}${badge("当前出牌","turn-badge")}</div></div>
    <div class="hand">${[0,1,4,9,11,16,18,19,30,13].map(kind => tileHTML(kind,{gold:kind===13})).join("")}</div>
    <div class="player-zones"><div class="player-zone"><div class="section-label">副露</div>
      <div class="meld-row"><span class="meld-name">碰</span>${tileHTML(27,{small:true}).repeat(3)}</div></div></div>
    <div class="action-area"><span class="action-btn">打出 1万</span><span class="action-btn ting">报听并打出 1万</span></div>
  </article>`);
})();
