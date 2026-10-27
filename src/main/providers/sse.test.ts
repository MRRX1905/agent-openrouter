import { describe, expect, it } from 'vitest';
import { parseSseStream } from './sse';

const streamOf = (...chunks: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
};

const collect = async (stream: ReadableStream<Uint8Array>): Promise<string[]> => {
  const values: string[] = [];
  for await (const value of parseSseStream(stream)) values.push(value);
  return values;
};

describe('parseSseStream', () => {
  it('handles events split across chunks', async () => {
    const values = await collect(streamOf('data: {"a":', '1}\n\ndata: [DONE]\n\n'));
    expect(values).toEqual(['{"a":1}', '[DONE]']);
  });

  it('handles CRLF and multiline data', async () => {
    const values = await collect(streamOf('data: line1\r\ndata: line2\r\n\r\n'));
    expect(values).toEqual(['line1\nline2']);
  });

  it('ignores comments and empty blocks', async () => {
    const values = await collect(streamOf(': keepalive\n\n\n\ndata: x\n\n'));
    expect(values).toEqual(['x']);
  });
});
