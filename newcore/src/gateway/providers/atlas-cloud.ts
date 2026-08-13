// ═══════════════════════════════════════════════════════════════
// OpenCentravity — Atlas Cloud Provider
// OpenAI-compatible chat completions through Atlas Cloud.
// ═══════════════════════════════════════════════════════════════

import type {
  ModelProvider, ModelInfo, CompletionRequest, CompletionResponse,
} from '../../types/index.js';

const DEFAULT_BASE_URL = 'https://api.atlascloud.ai/v1';
const DEFAULT_MODEL = 'qwen/qwen3.8-max';

export class AtlasCloudProvider implements ModelProvider {
  readonly name = 'atlas-cloud';
  readonly models: ModelInfo[] = [
    {
      id: DEFAULT_MODEL,
      provider: 'atlas-cloud',
      name: 'Qwen3.8 Max',
      contextWindow: 1_000_000,
      maxOutputTokens: 131_072,
      supportsTools: true,
      supportsStreaming: true,
      costPerInputToken: 0.000002,
      costPerOutputToken: 0.000006,
    },
  ];

  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = DEFAULT_BASE_URL) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const start = Date.now();
    const body: Record<string, unknown> = {
      model: request.model || DEFAULT_MODEL,
      messages: request.messages.map(message => {
        const result: Record<string, unknown> = {
          role: message.role,
          content: message.content,
        };
        if (message.name) result.name = message.name;
        if (message.toolCallId) result.tool_call_id = message.toolCallId;
        if (message.toolCalls) result.tool_calls = message.toolCalls;
        return result;
      }),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 8192,
    };

    if (request.tools?.length) {
      body.tools = request.tools;
      body.tool_choice = 'auto';
    }
    if (request.stop) body.stop = request.stop;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'User-Agent': 'OpenVelocity/0.1',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Atlas Cloud error (${response.status}): ${await response.text()}`);
    }

    const data = await response.json() as any;
    const choice = data.choices?.[0];
    if (!choice) throw new Error('Atlas Cloud returned no choices');

    const finishReason = choice.finish_reason === 'tool_calls'
      ? 'tool_calls'
      : choice.finish_reason === 'length'
        ? 'length'
        : 'stop';

    return {
      id: data.id,
      model: data.model,
      content: choice.message?.content ?? '',
      toolCalls: choice.message?.tool_calls?.map((toolCall: any) => ({
        id: toolCall.id,
        type: 'function' as const,
        function: {
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        },
      })),
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      finishReason,
      latencyMs: Date.now() - start,
    };
  }
}
