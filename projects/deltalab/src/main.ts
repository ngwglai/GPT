import './style.css';
import { initialize, rebuild } from './core/engine';
import { deleteNode, editNode, finite } from './core/graph';
import { preset, type Preset } from './core/experiments';
import { verify, type Verification } from './core/reference';
import { exportExperiment, importExperiment, MAX_JSON_BYTES, restore } from './core/serialization';
import { labels, operations, type Execution, type GraphNode, type Operation, type Snapshot, type Strategy, type Updates } from './core/types';
import { format, renderGraph } from './graph-view';
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
<header><a class="brand" href="./"><span class="brand-icon">Δ</span><span>DeltaLab<small>INCREMENTAL COMPUTATION LABORATORY</small></span></a><div class="header-right"><span class="offline">● 完全离线 · v0.1</span><button id="theme" aria-label="切换明暗主题">明暗主题</button></div></header>
<main><section class="intro"><div><p class="eyebrow">计算依赖 · 缓存复用 · 失效传播</p><h1>一个输入改变，<br>需要重算多少？</h1><p>在真实依赖图上，观察计算如何传播，以及何时停下。</p></div><aside><b>01 / 修改输入</b><b>02 / 选择策略</b><b>03 / 跟随真实计算</b><span>所有结果均与独立参考实现逐节点核对</span></aside></section>
<section class="toolbar panel" aria-label="实验配置"><label>预设实验<select id="preset"><option value="stable">Stable Output · 输出稳定</option><option value="chain">Chain · 链式传播</option><option value="branch">Branch · 分支依赖</option><option value="large">Large DAG · 固定种子</option></select></label><label>规模（4–1000）<input id="size" type="number" min="4" max="1000" value="80"></label><label>随机种子<input id="seed" type="number" min="0" max="4294967295" value="2026"></label><button id="load">载入预设</button><div class="toolbar-end"><button id="export">导出 JSON</button><label class="file-button">导入 JSON<input id="import" type="file" accept=".json,application/json"></label></div></section>
<div id="message" role="alert" hidden></div>
<div class="workspace"><div class="visual-column"><section class="panel graph-panel"><div class="section-head"><div><p class="eyebrow">DEPENDENCY GRAPH</p><h2>计算依赖图 <span id="node-count"></span></h2></div><span class="tag">SVG · 点击节点编辑</span></div><div class="legend"><span>○ 输入 / 待回放</span><span>◆ 已执行</span><span>▧ 缓存复用</span><span>→ 依赖方向</span></div><div id="graph" class="graph-scroll" tabindex="0" aria-label="可滚动依赖图"></div><p class="footnote">图结构编辑会完整重建缓存；连线从依赖指向计算节点。大图可横向、纵向滚动。</p></section>
<section class="panel"><div class="section-head"><div><p class="eyebrow">EXECUTION TRACE</p><h2>真实计算追踪</h2></div><output id="progress"></output></div><div class="controls"><button id="step">单步</button><button id="play">播放</button><button id="pause">暂停</button><button id="reset">重置实验</button><label>间隔<select id="speed"><option value="500">500 ms</option><option value="100">100 ms</option><option value="1000">1000 ms</option></select></label></div><p class="footnote">批次先真实执行并验证；这里回放算法产生的记录，不重复计算。暂停仅停止回放，重置恢复实验初态。</p><div class="table-scroll"><table><thead><tr><th>序号 / 节点</th><th>运算 / 输入值</th><th>旧值 → 新值</th><th>执行状态</th></tr></thead><tbody id="trace"></tbody></table></div></section></div>
<div class="side-column"><section class="panel"><p class="eyebrow">RUN AN EXPERIMENT</p><h2>输入与计算策略</h2><p id="hint" class="hint"></p><div id="inputs" class="input-grid"></div><label>执行策略<select id="strategy"><option value="full">Full Recompute · 完整重算</option><option value="dirty">Dirty Propagation · 脏节点传播</option><option value="change" selected>Change Propagation · 输出变化传播</option></select></label><p id="strategy-description" class="footnote"></p><button id="run" class="primary">计算批次 · 比较三种策略</button></section>
<section class="panel"><p class="eyebrow">COMPUTATIONAL COST</p><h2>整批计算统计</h2><div id="metrics" class="metric-grid"></div><p class="footnote">每次运算记 1 成本单位；不包含拓扑扫描、校验、参考验证和 UI 渲染。节省的是运算次数，不代表相同比例的运行时间。</p><div id="comparison"></div></section>
<section class="panel"><p class="eyebrow">INDEPENDENT VERIFICATION</p><h2>正确性验证</h2><div id="verification" role="status"></div><button id="validate">验证当前批次</button><button id="repro" hidden>导出失败复现</button></section>
<section class="panel"><p class="eyebrow">GRAPH EDITOR</p><h2>编辑节点</h2><label>现有节点<select id="node-select"></select></label><label>节点 ID<input id="node-id" maxlength="32" value=""></label><label>类型<select id="node-kind"><option value="input">输入节点</option><option value="compute">计算节点</option></select></label><div id="value-field"><label>初始数值<input id="node-value" type="number" step="any" value="0"></label></div><div id="compute-fields"><label>运算<select id="node-op">${operations.map(o => `<option value="${o}">${labels[o]}</option>`).join('')}</select></label><label>有序依赖（逗号分隔）<input id="node-deps" placeholder="x,y"></label></div><p class="footnote">abs 恰好 1 个参数，其余恰好 2 个。减法为第一个减第二个。重复依赖合法；删除前需先移除下游引用。</p><div class="controls"><button id="save-node">保存节点</button><button id="delete-node">删除节点</button></div></section></div></div>
<footer><span>Δ DeltaLab · 增量计算实验室</span><span>有限数值 · 精确比较 · 固定种子 · 无外部请求</span></footer></main>`;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => el<HTMLInputElement>(id);
const select = (id: string) => el<HTMLSelectElement>(id);
let state = initialize(preset('stable'));
let initial = structuredClone(state);
let viewBase: Snapshot = state;
let draft: Record<string, string> = {};
let report: Verification | undefined;
let execution: Execution | undefined;
let cursor = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let selected = '';
let currentPreset = 'stable';
let currentSeed = 2026;
let currentSize = 80;
const descriptions: Record<Strategy, string> = {
  full: '每批重新执行全部计算节点，即使输入值没有变化。',
  dirty: '重算实际变化输入的全部后代，中间输出稳定也继续。',
  change: '仅当直接上游输出变化时重算；稳定输出截断后续传播。',
};
const reasonLabel = (reason: string, changed: boolean) => reason === 'input' ? (changed ? '输入变化' : '输入未变') : reason === 'unaffected' ? '无关分支 · 缓存' : reason === 'blocked' ? '传播截断 · 缓存' : changed ? '已执行 · 输出变化' : '已执行 · 输出稳定';
function message(text = '', error = false) { el('message').hidden = !text; el('message').textContent = text; el('message').className = error ? 'error' : 'notice'; }
function guard(action: () => void) { try { action(); message(); } catch (e) { message(e instanceof Error ? e.message : '操作失败', true); } }
function stop() { if (timer !== undefined) clearTimeout(timer); timer = undefined; el('play').textContent = '播放'; el('pause').setAttribute('disabled', ''); }
function drafts() { draft = Object.fromEntries(state.graph.nodes.filter(n => n.kind === 'input').map(n => [n.id, String(state.values[n.id])])); }
function clearRun() { stop(); report = undefined; execution = undefined; cursor = 0; viewBase = state; }
function replace(next: Snapshot) { clearRun(); state = next; initial = structuredClone(next); viewBase = next; drafts(); selected = ''; render(); editor(); }
function getUpdates(): Updates {
  return Object.fromEntries(Object.entries(draft).map(([id, value]) => {
    if (!value.trim()) throw new Error(`输入 ${id} 不得为空`);
    return [id, finite(Number(value))];
  }));
}
function prepare() {
  stop();
  const next = verify(state, getUpdates()); // Atomic: retain old UI/state if numeric validation fails.
  report = next;
  if (!next.ok) { render(); throw new Error(`独立验证失败：${next.issues.join('；')}`); }
  viewBase = state;
  execution = next.executions[select('strategy').value as Strategy];
  state = execution.state; cursor = 0; drafts(); render(); editor();
}
function step() {
  if (!execution) prepare();
  if (execution && cursor < execution.trace.length) cursor++;
  renderPlayback();
}
function play() {
  stop(); if (!execution) prepare();
  if (execution && cursor >= execution.trace.length) cursor = 0;
  const tick = () => {
    try { step(); } catch (e) { stop(); message(String(e), true); return; }
    if (execution && cursor < execution.trace.length) { timer = setTimeout(tick, Number(select('speed').value)); el('play').textContent = '播放中'; el('pause').removeAttribute('disabled'); }
    else stop();
  };
  tick();
}
function renderPlayback() {
  const entries = execution?.trace.slice(0, cursor) ?? [];
  const values = { ...viewBase.values };
  for (const t of entries) values[t.nodeId] = t.newValue;
  renderGraph(el('graph'), state.graph, values, entries, selected);
  el('progress').textContent = `${cursor} / ${execution?.trace.length ?? 0} 条`;
  const body = el('trace'); body.replaceChildren();
  for (const t of entries.slice(-100)) {
    const row = document.createElement('tr');
    for (const value of [`${t.order} / ${t.nodeId}`, `${t.op === 'input' ? '输入' : labels[t.op]} (${t.inputs.map(format).join(', ')})`, `${format(t.oldValue)} → ${format(t.newValue)}`, reasonLabel(t.reason, t.changed)]) {
      const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
    }
    body.append(row);
  }
  if (!entries.length) body.innerHTML = '<tr><td colspan="4" class="empty">修改输入后计算批次，单步观察传播路径。</td></tr>';
  el('pause').toggleAttribute('disabled', timer === undefined);
}
function render() {
  el('node-count').textContent = `${state.graph.nodes.length} 节点`;
  el('hint').textContent = currentPreset === 'stable' ? '试一试：将 x 从 -2 改为 2。abs 输出仍为 2，变化传播会在此停下。' : '同时修改多个输入作为一个批次；重复赋相同值不会触发增量传播。';
  const inputs = el('inputs'); inputs.replaceChildren();
  for (const n of state.graph.nodes) if (n.kind === 'input') {
    const label = document.createElement('label'); label.textContent = n.id;
    const field = document.createElement('input'); field.type = 'number'; field.step = 'any'; field.value = draft[n.id]; field.dataset.input = n.id; field.setAttribute('aria-label', `输入 ${n.id}`);
    field.addEventListener('input', () => { draft[n.id] = field.value; clearRun(); renderEvidence(); renderPlayback(); }); label.append(field); inputs.append(label);
  }
  el('strategy-description').textContent = descriptions[select('strategy').value as Strategy];
  renderEvidence();
  const picker = select('node-select'); picker.replaceChildren(new Option('＋ 添加新节点', ''));
  for (const n of state.graph.nodes) picker.add(new Option(n.id, n.id)); picker.value = selected;
  renderPlayback();
}
function renderEvidence() {
  const m = execution?.metrics;
  el('metrics').innerHTML = [ ['实际计算', m?.executed ?? '—'], ['跳过 / 总数', m ? `${m.skipped} / ${m.total}` : '—'], ['输出变化', m?.changed ?? '—'], ['节省比例', m ? `${(m.savings * 100).toFixed(1)}%` : '—'], ['无关 / 截断缓存', m ? `${m.unaffected} / ${m.blocked}` : '—'], ['执行但输出稳定', m?.unchangedExecuted ?? '—'], ['理论成本', m ? `${m.theoreticalCost} / ${m.fullCost}` : '—'] ].map(([name, value]) => `<div><strong>${value}</strong><span>${name}</span></div>`).join('');
  el('comparison').innerHTML = report ? `<table><thead><tr><th>同批策略</th><th>实际运算</th><th>跳过</th></tr></thead><tbody>${(['full', 'dirty', 'change'] as const).map(s => `<tr><td>${s}</td><td>${report!.executions[s].metrics.executed}</td><td>${report!.executions[s].metrics.skipped}</td></tr>`).join('')}</tbody></table>` : '';
  el('verification').textContent = report ? report.ok ? '✓ 通过：三种策略全部节点数值、缓存及依赖，与独立完整重算一致。' : `验证失败：${report.issues.join('；')}` : '尚未运行。每批使用相同初态分别执行三种策略，再与独立参考实现比较。';
  el('verification').className = report ? report.ok ? 'verified' : 'error' : 'hint';
  el('repro').hidden = !report || report.ok;
}
function editor() {
  const n = state.graph.nodes.find(n => n.id === selected);
  input('node-id').value = n?.id ?? ''; input('node-id').readOnly = !!n;
  select('node-kind').value = n?.kind ?? 'input';
  input('node-value').value = n?.kind === 'input' ? String(state.values[n.id]) : '0';
  select('node-op').value = n?.kind === 'compute' ? n.op : 'add';
  input('node-deps').value = n?.kind === 'compute' ? n.deps.join(',') : '';
  editorFields();
}
function editorFields() { const compute = select('node-kind').value === 'compute'; el('compute-fields').hidden = !compute; el('value-field').hidden = compute; }
function currentGraph() { return { nodes: state.graph.nodes.map(n => n.kind === 'input' ? { ...n, value: state.values[n.id] } : n) }; }
function saveNode() {
  const id = input('node-id').value.trim();
  if (select('node-kind').value === 'input' && !input('node-value').value.trim()) throw new Error('初始数值不得为空');
  const node: GraphNode = select('node-kind').value === 'input' ? { id, kind: 'input', value: finite(Number(input('node-value').value)) } :
    { id, kind: 'compute', op: select('node-op').value as Operation, deps: input('node-deps').value.split(',').map(s => s.trim()).filter(Boolean) };
  const graph = editNode(currentGraph(), node, selected || undefined);
  const next = rebuild(graph); // Complete validation and evaluation before replacing anything.
  currentPreset = 'custom'; replace(next);
}
function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
for (const [id, action] of Object.entries({ run: prepare, step: () => { stop(); step(); }, play, pause: () => { stop(); renderPlayback(); }, reset: () => replace(structuredClone(initial)), 'save-node': saveNode,
  'delete-node': () => { if (!selected) throw new Error('请先选择节点'); const next = rebuild(deleteNode(currentGraph(), selected)); currentPreset = 'custom'; replace(next); },
  validate: prepare,
  load: () => {
    const name = select('preset').value as Preset, size = Number(input('size').value), seed = Number(input('seed').value);
    if (!input('seed').value.trim() || !Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('随机种子必须为 uint32');
    if (!input('size').value.trim() || !Number.isInteger(size) || size < 4 || size > 1000) throw new Error('规模必须为 4–1000 的整数');
    const next = initialize(preset(name, size, seed)); currentPreset = name; currentSeed = seed; currentSize = size; replace(next);
  },
  export: () => download(exportExperiment(state, { strategy: select('strategy').value as Strategy, preset: currentPreset, size: currentSize }, currentSeed), 'deltalab-experiment.json'),
  repro: () => { if (report) download(JSON.stringify(report.reproduction, null, 2), 'deltalab-reproduction.json'); },
})) el(id).addEventListener('click', () => guard(action));
select('preset').addEventListener('change', () => { el('load').focus(); });
select('strategy').addEventListener('change', () => {
  stop(); if (report?.ok) { execution = report.executions[select('strategy').value as Strategy]; state = execution.state; cursor = 0; } render();
});
select('node-kind').addEventListener('change', editorFields);
select('node-select').addEventListener('change', () => { selected = select('node-select').value; editor(); renderPlayback(); });
el('graph').addEventListener('click', e => { const node = (e.target as Element).closest('[data-node]'); if (node) { selected = node.getAttribute('data-node')!; select('node-select').value = selected; editor(); renderPlayback(); } });
el('graph').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const node = (e.target as Element).closest<SVGElement>('[data-node]'); if (node) { e.preventDefault(); node.dispatchEvent(new MouseEvent('click', { bubbles: true })); } } });
input('import').addEventListener('change', async () => {
  const file = input('import').files?.[0]; if (!file) return;
  try {
    if (file.size > MAX_JSON_BYTES) throw new Error('JSON 超过 512 KiB 上限');
    const data = importExperiment(await file.text());
    const next = restore(data); currentPreset = data.parameters.preset; currentSeed = data.seed; currentSize = data.parameters.size;
    select('strategy').value = data.parameters.strategy; input('seed').value = String(currentSeed); input('size').value = String(currentSize);
    if (currentPreset !== 'custom') select('preset').value = currentPreset;
    replace(next); message('JSON 已导入；全部缓存由图结构和输入重新计算。');
  } catch (e) { message(e instanceof Error ? e.message : '导入失败', true); }
  finally { input('import').value = ''; }
});
let dark = false;
try { dark = localStorage.getItem('deltalab-theme') === 'dark'; } catch { /* Storage may be unavailable offline. */ }
function theme() { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; el('theme').setAttribute('aria-pressed', String(dark)); }
el('theme').addEventListener('click', () => { dark = !dark; theme(); try { localStorage.setItem('deltalab-theme', dark ? 'dark' : 'light'); } catch { /* Optional preference only. */ } });
drafts(); theme(); render(); editor();
