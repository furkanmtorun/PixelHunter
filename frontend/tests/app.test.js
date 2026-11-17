import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_PIXELS, PALETTE, PHASE, state } from '../src/js/config.js';

test('board defaults match the backend', () => {
  assert.equal(state.GRID_W, 10);
  assert.equal(state.GRID_H, 10);
  assert.equal(MAX_PIXELS, 20);
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
