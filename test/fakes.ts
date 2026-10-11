import type Anthropic from '@anthropic-ai/sdk';

/** messages.create を差し替える。受け取ったリクエストは requests に残る */
export function fakeLlm(output: unknown, usage = { input_tokens: 1000, output_tokens: 200 }) {
  const requests: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const llm = {
    messages: {
      create: async (req: Anthropic.MessageCreateParamsNonStreaming) => {
        requests.push(req);
        return { content: [{ type: 'text', text: JSON.stringify(output) }], usage };
      },
    },
  } as unknown as Pick<Anthropic, 'messages'>;
  return { llm, requests };
}

export function fakeFetch(routes: Record<string, string | number>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix))?.[1];
    if (hit === undefined) return new Response('not found', { status: 404 });
    if (typeof hit === 'number') return new Response('error', { status: hit });
    return new Response(hit, { status: 200 });
  }) as typeof fetch;
}
