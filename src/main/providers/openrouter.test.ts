import { describe, expect, it } from 'vitest';
import { OpenRouterClient, OpenRouterError } from './openrouter';

const sseResponse = (chunks: string[]): Response => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
};

describe('OpenRouterClient', () => {
  it('assembles content, tool calls, and usage from a stream', async () => {
    const fetchImpl = (async () =>
      sseResponse([
        'data: {"id":"gen-1","model":"test/model","provider":"p","choices":[{"delta":{"content":"Hello "},"finish_reason":null}]}\n\n',
        'data: {"id":"gen-1","model":"test/model","choices":[{"delta":{"content":"world"},"finish_reason":null}]}\n\n',
        'data: {"id":"gen-1","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_file","arguments":"{\\"path\\":\\"a.txt\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
        'data: {"id":"gen-1","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
        'data: [DONE]\n\n',
      ])) as typeof fetch;

    const client = new OpenRouterClient({ apiKey: () => 'sk-or-v1-test', fetchImpl });
    const result = await client.chat({
      model: 'test/model',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
    });

    expect(result.content).toBe('Hello world');
    expect(result.toolCalls).toEqual([
      { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.txt"}' } },
    ]);
    expect(result.usage).toEqual({ prompt: 10, completion: 5, total: 15 });
    expect(result.finishReason).toBe('tool_calls');
  });

  it('throws a typed error on http failure and redacts the body', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { code: 429, message: 'rate limited sk-or-v1-secretsecretsecret' } }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
    const client = new OpenRouterClient({ apiKey: () => 'sk-or-v1-test', fetchImpl });

    let caught: unknown;
    try {
      await client.chat({ model: 'm', messages: [] });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(OpenRouterError);
    expect(caught).toMatchObject({ name: 'OpenRouterError', status: 429 });
    expect((caught as Error).message).not.toContain('secretsecretsecret');
  });
});
