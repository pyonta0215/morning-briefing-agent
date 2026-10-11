# GitHub Actions からデプロイする

手元から `npm run deploy` で十分なら、この手順は要りません。

1. CDK のブートストラップを済ませる（`npx cdk bootstrap`、リージョンごとに1回）
2. デプロイ用ロールを作る

   ```bash
   aws cloudformation deploy \
     --template-file infra/github-deploy.yaml \
     --stack-name morning-briefing-agent-github-deploy \
     --capabilities CAPABILITY_NAMED_IAM \
     --parameter-overrides GitHubRepository=<owner>/<repo>
   ```

   GitHub の OIDC プロバイダがアカウントに無いときは、先に IAM で `token.actions.githubusercontent.com`（audience `sts.amazonaws.com`）を作ります。

3. GitHub の Settings → Environments で `production` を作り、Deployment branches を `main` だけにする
4. Settings → Secrets and variables → Actions → Variables に入れる

   | 変数 | 例 |
   |---|---|
   | `AWS_DEPLOY_ROLE_ARN` | 手順2の出力 `DeployRoleArn` |
   | `AWS_REGION` | `ap-northeast-1` |
   | `RECIPIENT_EMAIL` / `SENDER_EMAIL` | SES で検証済みのアドレス |
   | `TOPICS_YAML`（任意） | topics.yaml の中身。リポジトリに置かないとき |
   | `SCHEDULE` / `TIME_ZONE`（任意） | `cron(30 6 * * ? *)` / `Asia/Tokyo` |

メールアドレスは秘密情報ではありませんが、公開リポジトリに残したくなければ Variables ではなく Secrets に置き、workflow 側の `vars.` を `secrets.` に変えてください。

`AWS_DEPLOY_ROLE_ARN` が無いあいだは deploy の job はスキップされ、CI だけが動きます。
