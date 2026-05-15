import { GRID_W, GRID_H } from '../src/js/config.js';

describe('Config Test', () => {
  test('GRID_W is 130', () => {
    expect(GRID_W).toBe(130);
  });
  test('GRID_H is 32', () => {
    expect(GRID_H).toBe(32);
  });
});
