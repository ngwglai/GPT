// Shared, escaped markup for gameplay, lobby and the asset gallery.
const seatNames = ["东", "南", "西", "北"];
function tileName(type) {
  if (type == null) return "—";
  if (type < 9) return `${type + 1}万`;
  if (type < 18) return `${type - 8}筒`;
  if (type < 27) return `${type - 17}条`;
  return "东南西北中发白"[type - 27];
}
function tileClass(type) {
  if (type < 9) return "suit-wan";
  if (type < 18) return "suit-tong";
  if (type < 27) return "suit-tiao";
  return "honor";
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function asset(path, key) {
  return window.MahjongPresentation?.assets?.resolve(path, String(key)) || null;
}
function imageWithFallback(url, label, fallback, className) {
  const text = `<span class="asset-fallback ${className}-fallback">${esc(fallback)}</span>`;
  return url ? `<img class="asset-image ${className}" src="${esc(url)}" alt="${esc(label)}" draggable="false">${text}` : text;
}
function icon(name) {
  const sprite = asset("ui", "icons") || "/assets/icons/marks.svg";
  return `<svg class="icon" aria-hidden="true"><use href="${esc(sprite)}#${name}"></use></svg>`;
}
function badge(text, style, symbol = "") {
  return `<span class="badge ${style}">${symbol ? icon(symbol) : ""}${esc(text)}</span>`;
}
function tileFaceMarkup(type) {
  const label = tileName(type);
  return imageWithFallback(asset("tiles", type), label, label, "tile-image");
}
class MahjongTile {
  static body(type, {back = false, dice = false, label = "暗牌"} = {}) {
    const concealed = back || (type == null && !dice);
    const pips = (value, caption = "") => imageWithFallback(asset("dice", value), caption, value ?? "—", "dice-image");
    const [near, right] = dice && type ? [[2,3],[6,3],[2,6],[2,1],[1,3],[5,3]][type - 1] : [];
    const face = dice ? pips(type, `骰子 ${type}`) : concealed
      ? imageWithFallback(asset("tiles", "back"), label, "暗", "tile-image") : tileFaceMarkup(type);
    const surface = (name, value) => `<span class="${name}" aria-hidden="true">${value ? pips(value) : ""}</span>`;
    return `<span class="tile-body${concealed ? " celadon-body" : ""}${dice ? " dice-body" : ""}">
      <span class="tile-top">${face}</span>${surface("tile-under", dice && 7 - type)}
      ${surface("tile-edge tile-edge-near", near)}${surface("tile-edge tile-edge-far", dice && 7 - near)}
      ${surface("tile-edge tile-edge-left", dice && 7 - right)}${surface("tile-edge tile-edge-right", right)}
    </span>`;
  }
}
function tileBackHTML(label = "暗牌") {
  return `<span class="tile small tile-back" title="${esc(label)}">${MahjongTile.body(null, {label})}</span>`;
}
function tileHTML(type, opts = {}) {
  const classes = ["tile", tileClass(type), opts.small ? "small" : "", opts.gold ? "gold" : "", opts.recent ? "recent" : "", opts.sideways ? "claimed-tile" : ""].filter(Boolean).join(" ");
  return `<span class="${classes}" title="${tileName(type)}">${MahjongTile.body(type)}</span>`;
}
function diceFaceHTML(value) {
  const image = value != null ? asset("dice", value) : null;
  return `<span class="dice-face${value == null ? " dice-empty" : ""}">${imageWithFallback(image, `骰子 ${value}`, value ?? "—", "dice-image")}</span>`;
}
function seatChoiceMarkup(seat, member, mine, disabled) {
  const presence = member?.connected ? badge("在线", "online", "online") : badge("断线", "offline", "offline");
  return `<button type="button" class="seat-choice${mine ? " chosen" : ""}${member ? " occupied" : " vacant"}"
    data-choose-seat="${seat}"${disabled ? " disabled" : ""}>
    <span class="seat-card-head"><span class="wind">${seatNames[seat]}</span>${member?.host ? badge("房主", "dealer", "host") : ""}</span>
    <strong>${member ? esc(member.nickname) : "空位"}</strong>
    <span class="seat-card-status">${member ? presence + (mine ? badge("你", "self") : "") : badge("点击入座", "vacant-label", "plus")}</span>
  </button>`;
}
function statusCard(stats) {
  return `<div class="status-card">${stats.map(([label, value]) =>
    `<div class="stat"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join("")}</div>`;
}
