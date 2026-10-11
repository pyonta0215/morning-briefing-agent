import { formatIsoJP } from './date.js';
import type { SelectedItem } from './select.js';
import type { Topic } from './topics.js';

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

export interface EmailInput {
  isoDate: string;
  title: string;
  topics: Topic[];
  byTopic: Record<string, SelectedItem[]>;
}

/** メールの組み立て。LLM は呼ばない（同じ入力から同じメールができる） */
export function buildEmail(input: EmailInput): BuiltEmail {
  const sections = input.topics
    .map((t) => ({ topic: t, items: input.byTopic[t.id] ?? [] }))
    .filter((s) => s.items.length > 0);
  const count = sections.reduce((n, s) => n + s.items.length, 0);
  const date = formatIsoJP(input.isoDate);
  const subject = `[${input.title}] ${date} ${count > 0 ? `${count}件` : '新着なし'}`;
  return { subject, html: html(input.title, date, sections), text: text(input.title, date, sections) };
}

type Section = { topic: Topic; items: SelectedItem[] };

function html(title: string, date: string, sections: Section[]): string {
  const body =
    sections.length === 0
      ? '<p class="empty">きょうは新着がありませんでした。</p>'
      : sections
          .map(
            (s) => `
  <h2>${esc(s.topic.label)}</h2>
  <ul>${s.items
    .map(
      (i) => `
    <li><a href="${esc(i.url)}">${esc(i.title)}</a><p>${esc(i.summary)}</p></li>`
    )
    .join('')}
  </ul>`
          )
          .join('');
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  body { margin:0; background:#f3f1ec; }
  .wrap { max-width:620px; margin:0 auto; background:#fff; padding:22px 24px 28px; color:#1a1714;
    font-family:"Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif; line-height:1.7; }
  h1 { font-size:20px; margin:0; border-bottom:3px double #1a1714; padding-bottom:8px; }
  .date { font-size:12px; color:#6b655d; margin-top:6px; }
  h2 { font-size:13px; letter-spacing:.2em; border-bottom:1px solid #1a1714; padding-bottom:4px; margin:26px 0 8px; }
  ul { list-style:none; margin:0; padding:0; }
  li { padding:8px 0; border-bottom:1px dotted #d8d3ca; }
  li a { color:#1a1714; font-weight:700; text-decoration:none; border-bottom:1px solid #c9c2b6; }
  li p { margin:4px 0 0; font-size:13px; color:#4a453f; }
  .empty { color:#6b655d; }
</style>
</head>
<body>
<div class="wrap">
  <h1>${esc(title)}</h1>
  <div class="date">${esc(date)}</div>
${body}
</div>
</body>
</html>`;
}

function text(title: string, date: string, sections: Section[]): string {
  const lines = [`${title}　${date}`, ''];
  if (sections.length === 0) lines.push('きょうは新着がありませんでした。');
  for (const s of sections) {
    lines.push(`== ${s.topic.label} ==`);
    for (const i of s.items) lines.push(`・${i.title}`, `  ${i.summary}`, `  ${i.url}`);
    lines.push('');
  }
  return lines.join('\n');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
