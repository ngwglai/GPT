const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../web/presentation.js"), "utf8");
const tick = () => new Promise(resolve => setImmediate(resolve));

async function main() {
  const handlers = new Map();
  const played = [], fetches = [];
  let contexts = 0, htmlAudio = 0;
  const document = {
    hidden: false, body: {hasAttribute: () => false},
    addEventListener(type, fn) { handlers.set(type, fn); },
    getElementById: () => null
  };
  class Context {
    constructor() { contexts++; this.state = "suspended"; this.destination = {}; }
    addEventListener(type, fn) { this.listener = fn; }
    resume() { this.state = "running"; this.listener?.(); return Promise.resolve(); }
    createGain() { return {gain:{value:1}, connect(){}}; }
    decodeAudioData(bytes, resolve) { resolve(bytes); }
    createBufferSource() {
      return {connect(gain){this.gain = gain;}, disconnect(){},
        start(){played.push(this.buffer); setImmediate(() => this.onended?.());},
        stop(){this.onended?.();}};
    }
  }
  const window = {AudioContext:Context, addEventListener(){}};
  vm.runInNewContext(source, {
    window, document, console, setTimeout, clearTimeout,
    localStorage:{getItem:()=>null, setItem(){}},
    Audio: class {constructor(){htmlAudio++;}},
    fetch: async url => {fetches.push(url); return {ok:true,arrayBuffer:async()=>url};}
  });
  const {audio, assets, bus} = window.MahjongPresentation;
  assets.manifest = {voice:{tiles:{"0":"a.wav","1":"b.wav","2":"c.wav","3":"d.wav"}, actions:{peng:"peng.wav"}},sfx:{}};
  // Events from all four seats must be queued and played without additional gestures.
  const discard = (player, type) => bus.emit({type:"TILE_DISCARDED",player,payload:{tile_type:type}});
  discard(0,0);
  assert.equal(contexts,0);
  handlers.get("touchend")({isTrusted:true});
  discard(1,1); discard(2,2); discard(3,3);
  for(let i=0;i<20;i++) await tick();
  assert.deepEqual(played,["/assets/a.wav","/assets/b.wav","/assets/c.wav","/assets/d.wav"]);
  assert.equal(contexts,1);
  assert.equal(htmlAudio,0);
  assert.equal(fetches.filter(url=>url==="/assets/a.wav").length,1);
  // A second round of four seats needs no new gesture; cached data is reused.
  for(let i=0;i<4;i++) discard(i,i);
  for(let i=0;i<20;i++) await tick();
  assert.equal(played.length,8);
  assert.equal(fetches.length,5);
  audio.setSetting("voiceEnabled",false);
  discard(2,2);
  await tick();
  assert.equal(played.length,8);
  audio.setSetting("voiceEnabled",true);
  audio.context.state="suspended";
  discard(3,3);
  await tick();
  assert.equal(played.length,8);
  handlers.get("visibilitychange")();
  for(let i=0;i<10;i++) await tick();
  assert.equal(played.length,9);
  assert.equal(contexts,1);
  // Hidden-page events must not accumulate for replay.
  document.hidden=true;
  handlers.get("visibilitychange")();
  discard(0,0);
  document.hidden=false;
  handlers.get("visibilitychange")();
  await tick();
  assert.equal(played.length,9);
  console.log("PASS: shared audio context, four seats, cache, mute, foreground recovery");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
