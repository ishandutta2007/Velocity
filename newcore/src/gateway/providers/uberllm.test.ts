import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/index.js', () => ({
  getConfig: () => ({
    uberllmApiKey: 'uberllm-test-key',
    uberllmBaseUrl: 'https://api.uberllm.dev/v1',
    geminiApiKey: undefined,
    openaiApiKey: undefined,
    anthropicApiKey: undefined,
    ollamaBaseUrl: 'http://localhost:11434',
  }),
}));

import { ModelGateway } from '../index.js';
import { UberLLMProvider } from './uberllm.js';

describe('UberLLMProvider', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers UberLLM and its default model with the gateway', () => {
    const gateway = new ModelGateway();

    expect(gateway.resolveModel('uberllm')).toEqual({
      provider: 'uberllm',
      model: 'openai/gpt-5.4-mini',
    });
    expect(gateway.getAvailableModels()).toContainEqual(expect.objectContaining({
      id: 'openai/gpt-5.4-mini',
      provider: 'uberllm',
      contextWindow: 400_000,
      maxOutputTokens: 128_000,
    }));
  });

  it('sends OpenAI-compatible chat completions to the UberLLM endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'chatcmpl-uberllm',
      model: 'openai/gpt-5.4-mini',
      choices: [{
        message: { role: 'assistant', content: 'UBERLLM_OK' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new UberLLMProvider('uberllm-key', 'https://api.uberllm.dev/v1/');
    const response = await provider.complete({
      model: 'openai/gpt-5.4-mini',
      messages: [{ role: 'user', content: 'Reply with UBERLLM_OK' }],
      temperature: 0,
      maxTokens: 32,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.uberllm.dev/v1/chat/completions');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer uberllm-key' });
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'openai/gpt-5.4-mini',
      temperature: 0,
      max_tokens: 32,
    });
    expect(response).toMatchObject({
      id: 'chatcmpl-uberllm',
      model: 'openai/gpt-5.4-mini',
      content: 'UBERLLM_OK',
      finishReason: 'stop',
      usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
    });
  });

  it('surfaces UberLLM API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 })));

    const provider = new UberLLMProvider('uberllm-key');
    await expect(provider.complete({
      model: 'openai/gpt-5.4-mini',
      messages: [{ role: 'user', content: 'hello' }],
    })).rejects.toThrow('UberLLM error (429): rate limited');
  });

  it('maps OpenAI-compatible tool calls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'chatcmpl-tool',
      model: 'openai/gpt-5.4-mini',
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

    const provider = new UberLLMProvider('uberllm-key');
    const response = await provider.complete({
      model: 'openai/gpt-5.4-mini',
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
