import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadConfig } from './index.js';

describe('Atlas Cloud configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('loads the Atlas Cloud API key and endpoint from the environment', () => {
    vi.stubEnv('ATLASCLOUD_API_KEY', 'atlas-test-key');
    vi.stubEnv('ATLASCLOUD_API_BASE', 'https://atlas.example/v1');

    expect(loadConfig()).toMatchObject({
      atlasCloudApiKey: 'atlas-test-key',
      atlasCloudBaseUrl: 'https://atlas.example/v1',
    });
  });
});
