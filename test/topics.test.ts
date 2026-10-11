import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseTopics } from '../src/topics.js';

test('topics.example.yaml はそのまま読める', () => {
  const topics = parseTopics(readFileSync('topics.example.yaml', 'utf8'));
  assert.deepEqual(topics.map((t) => t.id), ['ai', 'dev', 'paper']);
  assert.deepEqual(topics[1].urls, []);
});

test('urls と keywords を省略すると空配列になる', () => {
  const [t] = parseTopics('topics:\n  - id: a\n    label: A\n    research: { trending: [{ source: github }] }\n');
  assert.deepEqual(t.urls, []);
  assert.deepEqual(t.keywords, []);
});

test('形の誤りを起動時に理由付きで落とす', () => {
  assert.throws(() => parseTopics('topics: []'), /1件以上/);
  assert.throws(() => parseTopics('topics:\n  - id: AI\n    label: x\n    urls: [u]'), /id は英小文字/);
  assert.throws(
    () => parseTopics('topics:\n  - { id: a, label: x, urls: [u] }\n  - { id: a, label: y, urls: [u] }'),
    /重複/
  );
  assert.throws(() => parseTopics('topics:\n  - { id: a, urls: [u] }'), /label が必要/);
  assert.throws(() => parseTopics('topics:\n  - { id: a, label: x }'), /何も集められません/);
});
