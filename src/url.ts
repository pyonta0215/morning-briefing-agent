/** 重複判定用にURLを正規化する（フラグメント・トラッキングパラメータ・末尾スラッシュを落とす） */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid)/i.test(k)) u.searchParams.delete(k);
    }
    return u.toString().replace(/\/$/, '');
  } catch {
    return raw.trim();
  }
}

/**
 * 正規化URLが同じものを1件に畳む。既定は先に現れたものを残す。
 * preferCandidate が true を返したときだけ後から来たものに置き換える（位置は初出のまま）。
 */
export function dedupeByUrl<T extends { url: string }>(
  items: readonly T[],
  preferCandidate: (candidate: T, current: T) => boolean = () => false
): T[] {
  const unique: T[] = [];
  const indexByUrl = new Map<string, number>();
  for (const item of items) {
    const key = normalizeUrl(item.url);
    const at = indexByUrl.get(key);
    if (at === undefined) {
      indexByUrl.set(key, unique.length);
      unique.push(item);
    } else if (preferCandidate(item, unique[at])) {
      unique[at] = item;
    }
  }
  return unique;
}
