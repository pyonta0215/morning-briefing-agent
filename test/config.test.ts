import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { estimateCostUsd } from '../src/cost.js';

const base = { TOPICS_FILE: 'topics.example.yaml' };

test('送信するときは宛先と送信元が必須', () => {
  assert.throws(() => loadConfig(base), /RECIPIENT_EMAIL/);
  assert.throws(() => loadConfig({ ...base, RECIPIENT_EMAIL: 'a@example.com' }), /SENDER_EMAIL/);
});

test('DRY_RUN なら宛先なしで動き、既定値が入る', () => {
  const c = loadConfig({ ...base, DRY_RUN: 'true' });
  assert.equal(c.dryRun, true);
  assert.equal(c.model, 'claude-haiku-5-5');
  assert.equal(c.timeZone, 'Asia/Tokyo');
  assert.equal(c.bucket, undefined);
  assert.equal(c.enableResearch, true);
  assert.equal(c.topics.length, 3);
});

test('推定費用は長文脈の単価を切り替え、単価表に無いモデルは null にする（0 にしない）', () => {
  // 100K までは通常単価、超えると1リクエスト全体が長文脈の単価になる
  assert.equal(estimateCostUsd({ input_tokens: 100_000, output_tokens: 0 }, 'claude-haiku-5-5'), 0.01);
  assert.equal(estimateCostUsd({ input_tokens: 200_000, output_tokens: 0 }, 'claude-haiku-5-5'), 0.1);
  assert.equal(estimateCostUsd({ input_tokens: 1, output_tokens: 1 }, 'unknown-model'), null);
});
