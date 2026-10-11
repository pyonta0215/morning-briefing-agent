// Lambda 用に1ファイルへまとめ、topics.yaml と research-hub の購読リストを横に置く。
import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const topics = process.env.TOPICS_FILE ?? 'topics.yaml';
if (!existsSync(topics)) {
  console.error(`${topics} がありません。cp topics.example.yaml topics.yaml で作ってから編集してください`);
  process.exit(1);
}

mkdirSync('dist', { recursive: true });
await build({
  entryPoints: ['src/handler.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  outfile: 'dist/index.mjs',
  // Lambda の Node.js ランタイムに入っている。同梱すると重くなるだけ
  external: ['@aws-sdk/*'],
  // ESM で require を使う依存のため
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logOverride: { 'empty-import-meta': 'silent' },
});
copyFileSync(topics, 'dist/topics.yaml');
const require = createRequire(import.meta.url);
copyFileSync(require.resolve('research-hub-mcp/config/feeds.json'), 'dist/feeds.json');
console.log('dist/ を作りました');
