import { describe, expect, it } from 'vitest';
import { initialPlayback, playbackReducer } from '../src/simulation/playback';

describe('trace playback state', () => {
  it('steps while paused and clamps at final snapshot', () => {
    let state = playbackReducer(initialPlayback, { type: 'step', last: 1 });
    expect(state).toEqual({ index: 1, playing: false });
    state = playbackReducer(state, { type: 'step', last: 1 });
    expect(state.index).toBe(1);
  });
  it('pauses and resumes at the same trace position', () => {
    let state = playbackReducer(initialPlayback, { type: 'play', last: 4 });
    state = playbackReducer(state, { type: 'tick', last: 4 });
    state = playbackReducer(state, { type: 'pause' });
    expect(playbackReducer(state, { type: 'tick', last: 4 })).toBe(state);
    state = playbackReducer(state, { type: 'play', last: 4 });
    expect(playbackReducer(state, { type: 'tick', last: 4 })).toEqual({ index: 2, playing: true });
  });
  it('stops automatically at last snapshot and cannot play beyond it', () => {
    let state = playbackReducer({ index: 3, playing: true }, { type: 'tick', last: 4 });
    expect(state).toEqual({ index: 4, playing: false });
    state = playbackReducer(state, { type: 'play', last: 4 });
    expect(state.playing).toBe(false);
  });
  it('reset returns to initial paused state without mutating the constant', () => {
    expect(playbackReducer({ index: 10, playing: true }, { type: 'reset' })).toEqual(initialPlayback);
    expect(initialPlayback).toEqual({ index: 0, playing: false });
  });
});
