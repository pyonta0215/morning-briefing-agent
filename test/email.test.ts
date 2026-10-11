import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEmail } from '../src/email.js';
import type { Topic } from '../src/topics.js';

const topics: Topic[] = [
  { id: 'ai', label: 'AI', urls: ['u'], keywords: [] },
  { id: 'dev', label: '開発', urls: ['u'], keywords: [] },
];

test('件名に日付と件数を入れ、記事の無いトピックは出さない', () => {
  const email = buildEmail({
    isoDate: '2026-10-11',
    title: '朝のブリーフィング',
    topics,
    byTopic: { ai: [], dev: [{ url: 'https://x.test/1', title: 'T', summary: 'S', score: 4, topic: 'dev' }] },
  });
  assert.equal(email.subject, '[朝のブリーフィング] 2026年10月11日（日） 1件');
  assert.ok(email.html.includes('<h2>開発</h2>'));
  assert.ok(!email.html.includes('<h2>AI</h2>'));
  assert.ok(email.text.includes('== 開発 ==\n・T\n  S\n  https://x.test/1'));
});

test('記事の見出しと URL をエスケープする', () => {
  const email = buildEmail({
    isoDate: '2026-10-11',
    title: 't',
    topics,
    byTopic: { ai: [{ url: 'https://x.test/?a=1&b="2"', title: '<script>', summary: '', score: 5, topic: 'ai' }] },
  });
  assert.ok(email.html.includes('&lt;script&gt;'));
  assert.ok(email.html.includes('href="https://x.test/?a=1&amp;b=&quot;2&quot;"'));
});

test('新着が無い日もメールの形になる', () => {
  const email = buildEmail({ isoDate: '2026-10-11', title: 't', topics, byTopic: {} });
  assert.match(email.subject, /新着なし$/);
  assert.ok(email.text.includes('新着がありませんでした'));
});
