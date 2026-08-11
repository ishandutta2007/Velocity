import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/index.js', () => ({
  getConfig: () => ({
    atlasCloudApiKey: 'atlas-test-key',
    atlasCloudBaseUrl: 'https://api.atlascloud.ai/v1',
    geminiApiKey: undefined,
    openaiApiKey: undefined,
    anthropicApiKey: undefined,
    ollamaBaseUrl: 'http://localhost:11434',
  }),
}));

import { ModelGateway } from '../index.js';
import { AtlasCloudProvider } from './atlas-cloud.js';

describe('AtlasCloudProvider', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers Atlas Cloud and its default model with the gateway', () => {
    const gateway = new ModelGateway();

    expect(gateway.resolveModel('atlas-cloud')).toEqual({
      provider: 'atlas-cloud',
      model: 'qwen/qwen3.8-max',
    });
    expect(gateway.getAvailableModels()).toContainEqual(expect.objectContaining({
      id: 'qwen/qwen3.8-max',
      provider: 'atlas-cloud',
      contextWindow: 1_000_000,
      maxOutputTokens: 131_072,
    }));
  });

  it('sends OpenAI-compatible chat completions to the Atlas Cloud endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'chatcmpl-atlas',
      model: 'qwen/qwen3.8-max',
      choices: [{
        message: { role: 'assistant', content: 'ATLAS_OK' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AtlasCloudProvider('atlas-key', 'https://api.atlascloud.ai/v1/');
    const response = await provider.complete({
      model: 'qwen/qwen3.8-max',
      messages: [{ role: 'user', content: 'Reply with ATLAS_OK' }],
      temperature: 0,
      maxTokens: 32,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.atlascloud.ai/v1/chat/completions');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer atlas-key' });
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'qwen/qwen3.8-max',
      temperature: 0,
      max_tokens: 32,
    });
    expect(response).toMatchObject({
      id: 'chatcmpl-atlas',
      model: 'qwen/qwen3.8-max',
      content: 'ATLAS_OK',
      finishReason: 'stop',
      usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
    });
  });

  it('surfaces Atlas Cloud API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 })));

    const provider = new AtlasCloudProvider('atlas-key');
    await expect(provider.complete({
      model: 'qwen/qwen3.8-max',
      messages: [{ role: 'user', content: 'hello' }],
    })).rejects.toThrow('Atlas Cloud error (429): rate limited');
  });

  it('maps OpenAI-compatible tool calls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'chatcmpl-tool',
      model: 'qwen/qwen3.8-max',
      choices: [{
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call-weather',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Paris"}' },
          }],
        },
        finish_reason: 'tool_calls',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const provider = new AtlasCloudProvider('atlas-key');
    const response = await provider.complete({
      model: 'qwen/qwen3.8-max',
      messages: [{ role: 'user', content: 'Check the weather in Paris' }],
    });

    expect(response.finishReason).toBe('tool_calls');
    expect(response.toolCalls).toEqual([{
      id: 'call-weather',
      type: 'function',
      function: { name: 'get_weather', arguments: '{"city":"Paris"}' },
    }]);
  });
});
