import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeHistory, recentTitles, type DeliveredItem } from '../src/history.js';

const d = (url: string, isoDate: string, title = url): DeliveredItem => ({ url: `https://x.test/${url}`, title, topic: 't', isoDate });

test('保持期間より古い履歴を落とす', () => {
  const merged = mergeHistory([d('old', '2026-09-26'), d('keep', '2026-09-27')], [], '2026-10-11');
  assert.deepEqual(merged.map((m) => m.title), ['keep']);
});

test('同じURLは初めて配信した日を残す', () => {
  const merged = mergeHistory([d('a', '2026-10-05')], [{ ...d('a', '2026-10-11'), url: 'https://x.test/a#top' }], '2026-10-11');
  assert.equal(merged.length, 1);
  assert.equal(merged[0].isoDate, '2026-10-05');
});

test('recentTitles は期間内を新しい順に上限まで返す', () => {
  const history = [d('a', '2026-10-01'), d('b', '2026-10-09'), d('c', '2026-10-10'), d('e', '2026-10-03')];
  assert.deepEqual(recentTitles(history, '2026-10-11', 7, 2), ['c', 'b']);
  assert.deepEqual(recentTitles(history, '2026-10-11', 8), ['c', 'b', 'e']);
});
