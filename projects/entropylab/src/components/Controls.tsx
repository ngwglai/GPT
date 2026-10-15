import { useId } from 'react';
import type { Config, ExperimentId } from '../experiments/session';
import type { Boundary, Preset } from '../experiments/game-of-life/model';
import { Icon } from './Icon';

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <div className="field-label">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>
          {value}
          {unit}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--progress': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
      />
      <div className="range-ends">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
}

export function Controls({
  id,
  config: c,
  update,
  restore,
}: {
  id: ExperimentId;
  config: Config;
  update: (patch: Partial<Config>) => void;
  restore: () => void;
}) {
  return (
    <aside className="controls panel" aria-label="实验参数">
      <div className="section-heading">
        <h2>
          <Icon name="sliders" size={17} />
          实验参数
        </h2>
        <span>PARAMETERS</span>
      </div>
      <div className="controls-body">
        {(id === 'diffusion' || id === 'walk') && (
          <Range
            label="粒子数量"
            value={c.count}
            min={id === 'diffusion' ? 10 : 1}
            max={id === 'diffusion' ? 2000 : 512}
            onChange={(count) => update({ count })}
          />
        )}
        {id === 'diffusion' && (
          <>
            <Range
              label="运动速度"
              value={c.velocity}
              min={0}
              max={1}
              step={0.05}
              unit=" L/s"
              onChange={(velocity) => update({ velocity })}
            />
            <div className="field">
              <div className="field-label">
                <span id="divider-label">中央隔板</span>
                <span className="state-label">{c.divider ? '已关闭' : '已开启'}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={c.divider}
                aria-labelledby="divider-label"
                className={`switch ${c.divider ? 'on' : ''}`}
                onClick={() => update({ divider: !c.divider })}
              >
                <span />
              </button>
              <p className="field-help">开启隔板，让粒子扩散至整个容器。</p>
            </div>
          </>
        )}
        {id === 'walk' && (
          <>
            <Range
              label="步长 ℓ"
              value={c.stepLength}
              min={0.5}
              max={5}
              step={0.5}
              unit=" u"
              onChange={(stepLength) => update({ stepLength })}
            />
            <label className="select-field">
              轨迹观察窗口
              <select
                value={c.trailLength}
                onChange={(e) => update({ trailLength: Number(e.target.value) })}
              >
                <option value={16}>最近 16 步 · 短时</option>
                <option value={64}>最近 64 步 · 中时</option>
                <option value={128}>最近 128 步 · 长时</option>
              </select>
            </label>
          </>
        )}
        {(id === 'life' || id === 'ising') && (
          <label className="select-field">
            网格大小
            <select value={c.size} onChange={(e) => update({ size: Number(e.target.value) })}>
              {[...(id === 'ising' ? [16, 32] : []), ...(id === 'life' ? [40] : []), 64, 96].map(
                (n) => (
                  <option key={n} value={n}>
                    {n} × {n}
                  </option>
                ),
              )}
            </select>
          </label>
        )}
        {id === 'life' && (
          <>
            <label className="select-field">
              经典预设
              <select
                value={c.preset}
                onChange={(e) => update({ preset: e.target.value as Preset })}
              >
                <option value="glider">滑翔机 · Glider</option>
                <option value="blinker">闪烁器 · Blinker</option>
                <option value="pulsar">脉冲星 · Pulsar</option>
                <option value="gosper">高斯帕滑翔机枪</option>
                <option value="random">随机分布 · 28%</option>
                <option value="empty">空白画布</option>
              </select>
            </label>
            <label className="select-field">
              边界条件
              <select
                value={c.boundary}
                onChange={(e) => update({ boundary: e.target.value as Boundary })}
              >
                <option value="periodic">周期性边界</option>
                <option value="finite">有限边界</option>
              </select>
            </label>
          </>
        )}
        {id === 'ising' && (
          <>
            <Range
              label="温度 T"
              value={c.temperature}
              min={0}
              max={5}
              step={0.01}
              unit=" J/kᴮ"
              onChange={(temperature) => update({ temperature })}
            />
            <button className="critical-button" onClick={() => update({ temperature: 2.27 })}>
              设为临界温度附近 <span>2.27 ↗</span>
            </button>
            <label className="select-field">
              初始状态
              <select
                value={c.ordered ? 'ordered' : 'random'}
                onChange={(e) => update({ ordered: e.target.value === 'ordered' })}
              >
                <option value="random">随机自旋</option>
                <option value="ordered">有序自旋 · 全部 +1</option>
              </select>
            </label>
            <p className="field-help">周期性边界 · 无外场 · 最近邻耦合</p>
          </>
        )}
        {id !== 'diffusion' && (
          <Range
            label={id === 'walk' ? '步进频率' : id === 'life' ? '演化频率' : '采样频率'}
            value={c.rate}
            min={1}
            max={30}
            unit={id === 'ising' ? ' sweep/s' : id === 'life' ? ' 代/s' : ' step/s'}
            onChange={(rate) => update({ rate })}
          />
        )}
        <div className="control-divider" />
        <label className="select-field">
          播放倍率
          <select value={c.speed} onChange={(e) => update({ speed: Number(e.target.value) })}>
            {[0.25, 0.5, 1, 2, 4].map((n) => (
              <option key={n} value={n}>
                {n}×{n === 1 ? ' · 标准速度' : ''}
              </option>
            ))}
          </select>
        </label>
        <p className="field-help">倍率仅改变推进速率，不改变模型规则。后台标签页暂停计时。</p>
        <button className="restore-button" onClick={restore}>
          <Icon name="reset" size={15} />
          恢复默认参数
        </button>
        <p className="reset-note">
          粒子数、步长、网格或初态变更会重置并暂停。重置使用相同种子 42，便于复现实验。
        </p>
      </div>
    </aside>
  );
}
