# morning-briefing-agent

[![CI](https://github.com/pyonta0215/morning-briefing-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/pyonta0215/morning-briefing-agent/actions/workflows/ci.yml)

毎朝ニュースを集めて、Claude で**1回だけ**採点し、載せる記事は**決定的なコード**で選んでメールで届ける AWS Lambda のテンプレートです。
LLM の費用は収集量しだいですが、元にした朝刊エージェント（トピック8つ）で1日 $0.02 前後です。

筆者が毎朝使っている「朝刊エージェント」から、メール配信の中心部分だけを切り出したものです。設計の経緯は次の記事にあります。

- [朝刊エージェントを3日で作った](https://imai.me/lab/morning-agent)
- [朝刊エージェントの現在地](https://imai.me/lab/morning-agent-architecture)
- [1回$0.20の朝刊が、$0.02になるまで](https://imai.me/lab/morning-agent-cost)
- [AIの出力品質を「なんとなく」で語らない](https://imai.me/lab/morning-agent-eval)

## しくみ

```text
EventBridge Scheduler（毎朝1回）
  └─ Lambda
       1. 集める      topics.yaml の RSS / Atom / RDF、Google News 検索、
                      research-hub-mcp（Hacker News / arXiv / GitHub）を並列に取得
                      配信済みURLと2日より古い記事は、この段階でコードが落とす
       2. 採点する    Claude を1回だけ呼び、全記事に 1〜5 の重要度を付けさせる
                      （構造化出力。全トピックを required にして、トピックの取りこぼしを防ぐ）
       3. 選ぶ        スコア4以上を全件。該当なしのトピックは3以上の最高1件だけ救う
                      同じURLの重複を畳み、トピックごとの上限で切る ← LLM を使わない
       4. 届ける      メールを組み立てて SES で送る ← LLM を使わない
       5. 覚える      送れた記事だけを S3 の配信履歴（14日）に足す
```

LLM に任せるのは「どれが重要か」の判断だけです。何件載せるか、何を重複とみなすか、メールの形は、すべてコードで決めます。
同じスコアからは必ず同じメールができるので、選び方はテストで固定でき（`test/select.test.ts`）、LLM の呼び出しは1日1回に収まります。

## 5分で手元で動かす

Node.js 22 以上と Anthropic の API キーが要ります。メールは送らず、`out/briefing.html` に書き出します。

```bash
npm install
cp .env.example .env              # ANTHROPIC_API_KEY を入れる
npm run local                     # topics.example.yaml で1回動かす
open out/briefing.html
```

## 自分用にする

```bash
cp topics.example.yaml topics.yaml   # 収集先を書き換える
```

| 項目 | 意味 |
|---|---|
| `urls` | 一次情報のフィード。HTML も読めますが、記事URLが取れないのでフィードを推奨 |
| `keywords` | Google News の検索結果を足す（OR 検索・前日以降） |
| `research` | Hacker News の検索や GitHub の急上昇を足す（[research-hub-mcp](https://github.com/pyonta0215/research-hub-mcp)。外部APIの費用は0） |
| `maxItems` | 1通に載せる上限（既定8） |

採点の基準を変えたいときは `src/summarize.ts` のプロンプトを、載せる条件を変えたいときは `src/select.ts` の `threshold` / `rescueMin` を触ります。

## デプロイ

AWS CDK で、Lambda・配信履歴の S3 バケット・毎朝のスケジュールを1つのスタックとして作ります。

1. SES で送信元と宛先のアドレスを検証する（サンドボックスのままなら宛先の検証も要る）
2. API キーを SSM Parameter Store に SecureString で置く（値はスタックにもリポジトリにも入らない）

   ```bash
   aws ssm put-parameter --type SecureString \
     --name /morning-briefing-agent/anthropic-api-key --value 'sk-ant-...'
   ```

3. デプロイする

   ```bash
   npx cdk bootstrap   # そのアカウント・リージョンで初めてなら
   RECIPIENT_EMAIL=you@example.com SENDER_EMAIL=briefing@example.com npm run deploy
   ```

| 環境変数 | 既定 |
|---|---|
| `SCHEDULE` | `cron(30 6 * * ? *)`（毎朝6:30） |
| `TIME_ZONE` | `Asia/Tokyo` |
| `MODEL` | `claude-haiku-5-5` |
| `BRIEFING_TITLE` | `朝のブリーフィング` |
| `SES_REGION` | スタックと同じリージョン |

GitHub Actions から OIDC でデプロイする手順は [docs/deploy-github-actions.md](docs/deploy-github-actions.md) にあります。

## 止めかた・安全のための作り

- Lambda の予約同時実行数は1です。止めたいときは0にすれば、次の朝から動きません
  （`aws lambda put-function-concurrency --function-name <FunctionName> --reserved-concurrent-executions 0`）
- スケジュールのリトライは0回です。失敗した日にメールが2通届くことはありません
- SES の送信は、指定した送信元アドレスからだけに絞っています
- API キーは SSM から実行時に読みます。Lambda の環境変数にはパラメータ名しか入りません
- Anthropic のコンソールで、このキーに月額の上限を設定しておくことをおすすめします

## 開発

```bash
npm test            # ネットワークにも LLM にも触れない単体テスト
npm run typecheck
npm run synth       # バンドルと CloudFormation の生成（AWS には触らない）
```

## 元の朝刊エージェントにあって、ここに無いもの

閲覧用の Web サイト、話題を日をまたいで追う「ストーリー台帳」、Gmail・Google カレンダーの要約、web_search による補強は入れていません。
どれも個人の環境に強く依存するか、効果を測った結果止めたものです（経緯は上の記事）。

## License

MIT
