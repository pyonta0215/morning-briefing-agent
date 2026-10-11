export interface TokenPrice {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

/**
 * 推定費用の単価表。モデルを変えたらここも足す。
 * 表に無いモデルは費用を null にする（0 にすると「安く済んだ」と読めてしまうため）。
 */
export const PRICES: Readonly<Record<string, TokenPrice>> = {
  'claude-haiku-5-5': { inputPerMillionUsd: 0.1, outputPerMillionUsd: 0.5 },
};

/** Haiku 5.5 は1リクエストの入力が 100K トークンを超えると、入出力とも単価が上がる */
const LONG_CONTEXT_ABOVE = 100_000;
const LONG_CONTEXT_PRICES: Readonly<Record<string, TokenPrice>> = {
  'claude-haiku-5-5': { inputPerMillionUsd: 0.5, outputPerMillionUsd: 2.5 },
};

export function estimateCostUsd(
  usage: { input_tokens: number; output_tokens: number },
  model: string
): number | null {
  const price =
    (usage.input_tokens > LONG_CONTEXT_ABOVE ? LONG_CONTEXT_PRICES[model] : undefined) ?? PRICES[model];
  if (!price) return null;
  return (
    (usage.input_tokens * price.inputPerMillionUsd + usage.output_tokens * price.outputPerMillionUsd) / 1_000_000
  );
}
