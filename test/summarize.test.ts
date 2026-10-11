import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPrompt, buildSummaryFormat, summarize } from '../src/summarize.js';
import type { Topic } from '../src/topics.js';
import { fakeLlm } from './fakes.js';

const topics: Topic[] = [
  { id: 'ai', label: 'AI', urls: ['u'], keywords: [] },
  { id: 'dev', label: 'Dev', urls: ['u'], keywords: [] },
];

test('スキーマは全トピックを required にし、余計なキーを許さない', () => {
  const format = buildSummaryFormat(topics) as unknown as { schema: Record<string, unknown> };
  assert.deepEqual(format.schema.required, ['ai', 'dev']);
  assert.equal(format.schema.additionalProperties, false);
});

test('配信済みの見出しがあるときだけプロンプトに載せる', () => {
  const base = { todayIso: '2026-10-11', topics, collected: 'DATA' };
  assert.ok(!buildPrompt({ ...base, recentTitles: [] }).includes('配信済み'));
  const p = buildPrompt({ ...base, recentTitles: ['前の記事'] });
  assert.match(p, /・前の記事/);
  assert.match(p, /全トピック（ai, dev）/);
  assert.ok(p.endsWith('DATA'));
});

test('summarize は構造化出力をパースし、使用量を返す', async () => {
  const { llm, requests } = fakeLlm({ ai: [{ url: 'https://a', title: 't', summary: 's', score: 5 }], dev: [] });
  const r = await summarize(llm, 'claude-haiku-5-5', topics, 'prompt');
  assert.equal(r.candidates.ai[0].score, 5);
  assert.equal(r.usage.input_tokens, 1000);
  assert.equal(requests[0].model, 'claude-haiku-5-5');
});
