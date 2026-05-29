// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { getRouteFromHash, setRoute } from './router';

describe('renderer router', () => {
  it('keeps the retired Context route folded into Tasks', () => {
    window.location.hash = '#/context';

    expect(getRouteFromHash()).toBe('tasks');
  });

  it('writes retained routes to the hash', () => {
    setRoute('business');

    expect(window.location.hash).toBe('#business');
  });
});
