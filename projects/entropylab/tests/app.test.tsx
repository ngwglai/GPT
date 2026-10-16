import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../src/App';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function experiment(name: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
}
function metric(label: string) {
  const container = screen.getByLabelText('实时统计');
  const node = within(container).getByText(label).parentElement!;
  return node.querySelector('strong')!.textContent;
}

describe('application interaction', () => {
  it('renders all experiments, clear labels, principle and chart units', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('粒子扩散与熵增');
    expect(screen.getByRole('img', { name: /空间熵的演化/ })).toBeTruthy();
    expect(screen.getByText(/不是完整热力学熵/)).toBeTruthy();
    experiment('二维随机游走');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('二维随机游走');
    experiment('康威生命游戏');
    expect(screen.getByLabelText('经典预设')).toBeTruthy();
    experiment('二维伊辛模型');
    expect(screen.getByLabelText('温度 T')).toBeTruthy();
    expect(screen.getByText(/不等于真实物理时间/)).toBeTruthy();
  });
  it('starts, pauses, disables single-step while running, and resets to paused', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '开始模拟' }));
    expect(screen.getByRole('status', { name: '模拟状态' }).textContent).toBe('运行中');
    expect((screen.getByRole('button', { name: '单步执行' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: '暂停' }));
    expect(screen.getByRole('status', { name: '模拟状态' }).textContent).toBe('已暂停');
    fireEvent.click(screen.getByRole('button', { name: '单步执行' }));
    fireEvent.click(screen.getByRole('button', { name: '开始模拟' }));
    fireEvent.click(screen.getByRole('button', { name: '重置模拟' }));
    expect(screen.getByRole('status', { name: '模拟状态' }).textContent).toBe('已暂停');
    expect(metric('模拟时间')).toBe('0.0');
  });
  it('updates divider and parameters, restores defaults, and restarts on count change', () => {
    render(<App />);
    const divider = screen.getByRole('switch', { name: '中央隔板' });
    expect(divider.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(divider);
    expect(divider.getAttribute('aria-checked')).toBe('false');
    fireEvent.change(screen.getByLabelText('粒子数量'), { target: { value: '2000' } });
    expect((screen.getByLabelText('粒子数量') as HTMLInputElement).value).toBe('2000');
    expect(metric('左半区 / 右半区')).toBe('2000 / 0');
    fireEvent.click(screen.getByRole('button', { name: '恢复默认参数' }));
    expect((screen.getByLabelText('粒子数量') as HTMLInputElement).value).toBe('500');
    expect(screen.getByRole('switch', { name: '中央隔板' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });
  it('advances a walk by 100 steps and resets statistics after changing step length', () => {
    render(<App />);
    experiment('二维随机游走');
    fireEvent.click(screen.getByRole('button', { name: '+100 步' }));
    expect(metric('累计步数')).toBe('100');
    expect(metric('理论期望 nℓ²')).toBe('100.00');
    fireEvent.change(screen.getByLabelText('步长 ℓ'), { target: { value: '5' } });
    expect(metric('累计步数')).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: '单步执行' }));
    expect(metric('理论期望 nℓ²')).toBe('25.00');
  });
  it('loads Life presets, steps an oscillator and clears cells', () => {
    render(<App />);
    experiment('康威生命游戏');
    expect(metric('活细胞数量')).toBe('5');
    fireEvent.change(screen.getByLabelText('经典预设'), { target: { value: 'blinker' } });
    expect(metric('活细胞数量')).toBe('3');
    fireEvent.click(screen.getByRole('button', { name: '单步执行' }));
    expect(metric('当前代数')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: '清空' }));
    expect(metric('活细胞数量')).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: '恢复默认参数' }));
    expect(metric('活细胞数量')).toBe('5');
    expect(metric('当前代数')).toBe('0');
  });
  it('initializes Ising with ordered spins and preserves state on temperature change', () => {
    render(<App />);
    experiment('二维伊辛模型');
    fireEvent.change(screen.getByLabelText('初始状态'), { target: { value: 'ordered' } });
    expect(metric('每自旋磁化 m')).toBe('1.000');
    expect(metric('每自旋平均能量')).toBe('-2.000');
    fireEvent.change(screen.getByLabelText('温度 T'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: '单步执行' }));
    expect(metric('每自旋磁化 m')).toBe('1.000');
    expect(metric('Monte Carlo 步数')).toBe('1');
  });
  it('switches theme and stores the preference; experiments switch cleanly', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '切换浅色主题' }));
    expect(container.querySelector('.app.light')).toBeTruthy();
    expect(localStorage.getItem('entropylab-theme')).toBe('light');
    experiment('二维随机游走');
    fireEvent.click(screen.getByRole('button', { name: '开始模拟' }));
    experiment('粒子扩散与熵增');
    expect(screen.getByRole('status', { name: '模拟状态' }).textContent).toBe('已暂停');
    expect(metric('模拟时间')).toBe('0.0');
  });
});
