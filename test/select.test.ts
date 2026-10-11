import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectItems } from '../src/select.js';
import type { Candidate } from '../src/summarize.js';
import type { Topic } from '../src/topics.js';

const topic = (id: string, maxItems?: number): Topic => ({ id, label: id, urls: ['u'], keywords: [], maxItems });
const c = (url: string, score: number): Candidate => ({ url: `https://x.test/${url}`, title: url, summary: '', score });

test('閾値以上を全件、スコアの高い順に載せる', () => {
  const { byTopic } = selectItems([topic('a')], { a: [c('1', 4), c('2', 3), c('3', 5)] }, new Set());
  assert.deepEqual(byTopic.a.map((i) => i.title), ['3', '1']);
});

test('閾値に届く記事が無いトピックは、下限以上の最高スコア1件を救う', () => {
  const { byTopic, stats } = selectItems([topic('a')], { a: [c('1', 2), c('2', 3)] }, new Set());
  assert.deepEqual(byTopic.a.map((i) => i.title), ['2']);
  assert.equal(stats.rescued, 1);
});

test('救済の下限に届かなければ載せない（鳴らない日は黙る）', () => {
  const { byTopic, stats } = selectItems([topic('a')], { a: [c('1', 2), c('2', 1)] }, new Set());
  assert.deepEqual(byTopic.a, []);
  assert.equal(stats.droppedLowScore, 1);
});

test('トピックごとの上限で切る', () => {
  const { byTopic } = selectItems([topic('a', 2)], { a: [c('1', 5), c('2', 5), c('3', 4)] }, new Set());
  assert.equal(byTopic.a.length, 2);
});

test('配信済みのURLは載せない', () => {
  const { byTopic, stats } = selectItems(
    [topic('a')],
    { a: [c('1', 5), c('2', 5)] },
    new Set(['https://x.test/1'])
  );
  assert.deepEqual(byTopic.a.map((i) => i.title), ['2']);
  assert.equal(stats.alreadyDelivered, 1);
});

test('トピックを跨いだ同じ記事は、スコアの高い方に1件だけ残す', () => {
  const { byTopic, stats } = selectItems(
    [topic('a'), topic('b')],
    { a: [c('same', 4)], b: [{ ...c('same', 5), url: 'https://x.test/same?utm_source=x' }] },
    new Set()
  );
  assert.deepEqual(byTopic.a, []);
  assert.equal(byTopic.b.length, 1);
  assert.equal(stats.duplicates, 1);
});

test('LLM がトピックを丸ごと返さなくても落ちない', () => {
  const { byTopic } = selectItems([topic('a'), topic('b')], { a: [c('1', 5)] }, new Set());
  assert.deepEqual(byTopic.b, []);
});
