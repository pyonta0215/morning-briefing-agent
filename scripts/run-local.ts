/**
 * 手元で1回だけ動かし、メールは送らずに out/ へ書き出す。
 *
 *   cp .env.example .env   # ANTHROPIC_API_KEY を入れる
 *   npm run local
 *
 * 費用は claude-haiku-5-5 で1回 $0.01 前後（トピック数と収集量による）。
 */
import Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, writeFileSync } from 'node:fs';
import { runBriefing } from '../src/briefing.js';
import { loadConfig } from '../src/config.js';
import { memoryHistoryStore } from '../src/history.js';

try {
  process.loadEnvFile('.env');
} catch {
  // .env が無ければ環境変数だけで動かす
}
const config = loadConfig({ TOPICS_FILE: 'topics.example.yaml', ...process.env, DRY_RUN: 'true' });
const result = await runBriefing(config, {
  llm: new Anthropic(),
  history: memoryHistoryStore(),
  send: async () => {},
});
mkdirSync('out', { recursive: true });
writeFileSync('out/briefing.html', result.email.html);
writeFileSync('out/briefing.txt', result.email.text);
console.log(`${result.email.subject}\n→ out/briefing.html（推定費用 $${result.costUsd?.toFixed(4) ?? '不明'}）`);
