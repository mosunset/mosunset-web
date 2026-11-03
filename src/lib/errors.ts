/** server function のエラーを画面に出す文言にする */
export function errorMessage(e: unknown, fallback = '保存できませんでした') {
  if (e instanceof Error) {
    // zod の検証エラーは JSON 文字列で届くので、最初のメッセージだけ取り出す
    try {
      const issues = JSON.parse(e.message) as { message: string }[]
      if (Array.isArray(issues) && issues[0]?.message) return issues[0].message
    } catch {}
    return e.message
  }
  return fallback
}
