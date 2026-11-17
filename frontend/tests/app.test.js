import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_MODE,
  MODE_OPTIONS,
  PALETTE,
  PHASE,
  getMode,
  state,
} from '../src/js/config.js';

test('board defaults match the hard mode', () => {
  assert.equal(DEFAULT_MODE, 'hard');
  assert.equal(state.GRID_W, 10);
  assert.equal(state.GRID_H, 10);
  assert.equal(state.maxPixels, 20);
  assert.equal(state.nHitToWin, 11);
  assert.equal(state.scoresToWin, 1000);
});

test('mode presets match the backend config', () => {
  const expected = {
    easy: { matrix: [3, 3], maxPixels: 4, nHitToWin: 4, scoresToWin: 600 },
    medium: { matrix: [6, 6], maxPixels: 12, nHitToWin: 12, scoresToWin: 1000 },
    hard: { matrix: [10, 10], maxPixels: 20, nHitToWin: 11, scoresToWin: 1000 },
  };

  assert.deepEqual(MODE_OPTIONS.map((mode) => mode.key), ['easy', 'medium', 'hard']);
  for (const mode of MODE_OPTIONS) {
    const want = expected[mode.key];
    assert.deepEqual(mode.matrix, want.matrix);
    assert.equal(mode.maxPixels, want.maxPixels);
    assert.equal(mode.nHitToWin, want.nHitToWin);
    assert.equal(mode.scoresToWin, want.scoresToWin);
  }
});

test('getMode falls back to the default mode', () => {
  assert.equal(getMode('easy').key, 'easy');
  assert.equal(getMode('nope').key, DEFAULT_MODE);
  assert.equal(getMode(undefined).key, DEFAULT_MODE);
});

test('palette entries are unique hex colors', () => {
  assert.equal(new Set(PALETTE).size, PALETTE.length);
  for (const color of PALETTE) assert.match(color, /^#[0-9a-f]{6}$/i);
});

test('state starts in the login phase with empty collections', () => {
  assert.equal(state.gameState, PHASE.LOGIN);
  assert.equal(state.myLockedPixels.size, 0);
  assert.equal(state.opponentHits.size, 0);
  assert.equal(state.opponentMisses.size, 0);
});

test('all game phases are defined', () => {
  assert.deepEqual(Object.keys(PHASE).sort(), [
    'GAME_OVER',
    'LOBBY',
    'LOGIN',
    'PLACEMENT',
    'PLAYING',
    'WAITING',
  ]);
});
