// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { getRouteFromHash, setRoute } from './router';

describe('renderer router', () => {
  it('folds retired task-shell routes back into Today', () => {
    window.location.hash = '#/context';

    expect(getRouteFromHash()).toBe('brief');

    window.location.hash = '#/tasks';

    expect(getRouteFromHash()).toBe('brief');
  });

  it('writes retained routes to the hash', () => {
    setRoute('business');

    expect(window.location.hash).toBe('#business');
  });

  it('keeps Chat as a retained Work route', () => {
    window.location.hash = '#/chat';

    expect(getRouteFromHash()).toBe('chat');
  });
});
