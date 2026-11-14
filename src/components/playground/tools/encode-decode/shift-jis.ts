/**
 * Shift_JIS（ブラウザの TextDecoder と同じ Windows-31J）の変換。
 * ブラウザは Shift_JIS を読むこと（デコード）はできても書くこと（エンコード）はできないので、
 * 2 バイトの組み合わせをすべて TextDecoder で読んで、逆引きの表をその場で作る。
 * 表は Shift_JIS を初めて選んだときに 1 回だけ作る（数十ミリ秒）
 */

let table: Map<number, number> | null = null

function lead(b: number) {
  return (b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xfc)
}

function buildTable() {
  const decoder = new TextDecoder('shift_jis')
  const map = new Map<number, number>()
  // 1 バイト: ASCII と半角カナ
  for (let b = 0; b <= 0x80; b++) map.set(b, b)
  for (let b = 0xa1; b <= 0xdf; b++) map.set(0xff61 + (b - 0xa1), b)
  // 2 バイト。同じ文字が 2 か所にある（NEC 選定 IBM 拡張と IBM 拡張）ときは、
  // WHATWG の Encoding 仕様に合わせて IBM 拡張（0xFA〜0xFC）を使うため、0xED・0xEE を後回しにする
  const leads: number[] = []
  for (let b = 0x81; b <= 0xfc; b++)
    if (lead(b) && b !== 0xed && b !== 0xee) leads.push(b)
  leads.push(0xed, 0xee)
  const pair = new Uint8Array(2)
  for (const l of leads) {
    for (let t = 0x40; t <= 0xfc; t++) {
      if (t === 0x7f) continue
      pair[0] = l
      pair[1] = t
      const s = decoder.decode(pair)
      if (s.length !== 1 || s === '�') continue
      const code = s.charCodeAt(0)
      if (!map.has(code)) map.set(code, (l << 8) | t)
    }
  }
  // WHATWG の Shift_JIS エンコーダーと同じ置き換え
  map.set(0xa5, 0x5c) // ¥
  map.set(0x203e, 0x7e) // ‾
  map.set(0x2212, 0x817c) // −（全角マイナス）
  return map
}

export function shiftJisSupported() {
  try {
    new TextDecoder('shift_jis')
    return true
  } catch {
    return false
  }
}

/** テキストを Shift_JIS のバイト列にする。表にない文字は「?」にして unmappable に入れる */
export function encodeShiftJis(text: string) {
  table ??= buildTable()
  const out: number[] = []
  const unmappable = new Set<string>()
  for (const ch of text) {
    const code = ch.length === 1 ? (table.get(ch.charCodeAt(0)) ?? -1) : -1
    if (code < 0) {
      unmappable.add(ch)
      out.push(0x3f)
    } else if (code > 0xff) {
      out.push(code >> 8, code & 0xff)
    } else {
      out.push(code)
    }
  }
  return { bytes: Uint8Array.from(out), unmappable: [...unmappable] }
}
