import { describe, expect, it } from 'vitest';

import { resolveProviderNativeToolName, toProviderNativeToolName } from './provider-native-tool-names.js';

describe('provider native tool names', () => {
  it('uses provider-safe aliases while preserving Taskplane tool identity', () => {
    const providerName = toProviderNativeToolName('task.inspect_context');

    expect(providerName).toBe('taskplane__task__inspect_context');
    expect(resolveProviderNativeToolName(providerName)).toBe('task.inspect_context');
  });

  it('still accepts existing Taskplane tool names from already-normalized payloads', () => {
    expect(resolveProviderNativeToolName('workspace.read_file')).toBe('workspace.read_file');
  });

  it('fails closed for unknown aliases', () => {
    expect(resolveProviderNativeToolName('taskplane__workspace__delete_all')).toBeNull();
    expect(resolveProviderNativeToolName('workspace.delete_all')).toBeNull();
  });
});
