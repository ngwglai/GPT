export interface Playback { index: number; playing: boolean }
export type PlaybackAction =
  | { type: 'step'; last: number }
  | { type: 'tick'; last: number }
  | { type: 'play'; last: number }
  | { type: 'pause' }
  | { type: 'reset' };
export const initialPlayback: Playback = { index: 0, playing: false };

export function playbackReducer(state: Playback, action: PlaybackAction): Playback {
  switch (action.type) {
    case 'reset': return { ...initialPlayback };
    case 'pause': return { ...state, playing: false };
    case 'play': return { ...state, playing: state.index < action.last };
    case 'tick':
      if (!state.playing) return state;
      return { index: Math.min(action.last, state.index + 1), playing: state.index + 1 < action.last };
    case 'step': return { index: Math.min(action.last, state.index + 1), playing: false };
  }
}
