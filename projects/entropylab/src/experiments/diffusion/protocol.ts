import type { Config, Snapshot } from '../session';

export interface GasRequest {
  id: number;
  action: 'init' | 'advance' | 'step' | 'update' | 'pause';
  config?: Config;
  patch?: Partial<Config>;
  ticks?: number;
  buffer?: Float64Array;
}
export interface GasPacket {
  id: number;
  action: GasRequest['action'];
  buffer: Float64Array;
  snapshot: Snapshot;
}
export interface GasDriver {
  pending: number;
  post: (request: Omit<GasRequest, 'id' | 'buffer'>) => void;
}
