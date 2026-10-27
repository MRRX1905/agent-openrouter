import { redact } from '../../shared/redact';
import type { AgentMessage, TokenUsage, ToolCall, ToolDefinition } from '../../shared/types';
import { parseSseStream } from './sse';

export interface ChatRequest {
  model: string;
  messages: AgentMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ChatResponse {
  id: string;
  model: string;
  provider: string | null;
  content: string;
  toolCalls: ToolCall[];
  usage: TokenUsage | null;
  finishReason: string | null;
}

export class OpenRouterError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

interface Chunk {
  id?: string;
  model?: string;
  provider?: string;
  choices?: Array<{
    delta?: { content?: string; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { code?: number | string; message?: string };
}

export class OpenRouterClient {
  private readonly baseUrl: string;

  constructor(private readonly options: { apiKey: () => string; fetchImpl?: typeof fetch; baseUrl?: string }) {
    this.baseUrl = options.baseUrl ?? 'https://openrouter.ai/api/v1';
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const response = await fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.apiKey()}`,
        'Content-Type': 'application/json',
        'X-Title': 'R3X Agent Studio',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        ...(request.tools && request.tools.length > 0 ? { tools: request.tools } : {}),
        ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
        stream: true,
      }),
      signal: request.signal,
    });

    if (!response.ok) {
      const body = redact(await response.text());
      let code = String(response.status);
      try { code = String((JSON.parse(body) as { error?: { code?: unknown } }).error?.code ?? code); } catch { /* body bukan JSON */ }
      throw new OpenRouterError(response.status, code, `OpenRouter ${response.status}: ${body.slice(0, 500)}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream') || !response.body) {
      const json = (await response.json()) as {
        id?: string; model?: string; provider?: string;
        choices?: Array<{ message?: { content?: string; tool_calls?: ToolCall[] }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const choice = json.choices?.[0];
      return {
        id: json.id ?? '', model: json.model ?? request.model, provider: json.provider ?? null,
        content: choice?.message?.content ?? '', toolCalls: choice?.message?.tool_calls ?? [],
        usage: json.usage ? { prompt: json.usage.prompt_tokens ?? 0, completion: json.usage.completion_tokens ?? 0, total: json.usage.total_tokens ?? 0 } : null,
        finishReason: choice?.finish_reason ?? null,
      };
    }

    let id = '';
    let model = request.model;
    let provider: string | null = null;
    let content = '';
    let finishReason: string | null = null;
    let usage: TokenUsage | null = null;
    const toolCalls = new Map<number, { id: string; name: string; args: string }>();

    for await (const data of parseSseStream(response.body)) {
      if (data === '[DONE]') break;
      let chunk: Chunk;
      try { chunk = JSON.parse(data) as Chunk; } catch { throw new OpenRouterError(502, 'bad_stream', 'OpenRouter mengirim event yang tidak valid'); }
      if (chunk.error) {
        throw new OpenRouterError(Number(chunk.error.code ?? 502), String(chunk.error.code ?? 'stream_error'), redact(chunk.error.message ?? 'stream error'));
      }
      id = chunk.id ?? id;
      model = chunk.model ?? model;
      provider = chunk.provider ?? provider;
      if (chunk.usage) {
        usage = {
          prompt: chunk.usage.prompt_tokens ?? 0,
          completion: chunk.usage.completion_tokens ?? 0,
          total: chunk.usage.total_tokens ?? 0,
        };
      }
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      content += choice.delta?.content ?? '';
      finishReason = choice.finish_reason ?? finishReason;
      for (const part of choice.delta?.tool_calls ?? []) {
        const index = part.index ?? 0;
        const current = toolCalls.get(index) ?? { id: '', name: '', args: '' };
        if (part.id) current.id = part.id;
        current.name += part.function?.name ?? '';
        current.args += part.function?.arguments ?? '';
        toolCalls.set(index, current);
      }
    }

    return {
      id, model, provider, content, finishReason, usage,
      toolCalls: [...toolCalls.entries()]
        .sort(([a], [b]) => a - b)
        .map(([index, call]) => ({
          id: call.id || `call_${index}`,
          type: 'function' as const,
          function: { name: call.name, arguments: call.args },
        })),
    };
  }
}
