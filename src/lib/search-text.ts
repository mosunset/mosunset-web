/**
 * 検索で比べるために文字の形をそろえる。
 * 全角・半角（NFKC）、大文字・小文字、カタカナ・ひらがなの違いをなくす
 * （「チイカワ」でも「ちいかわ」でも見つかるように）
 */
export function normalizeForSearch(text: string) {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}
