// 記事の本文（画面に出ている HTML）を、プレーンテキストか Markdown の文字列にする。
// ブラウザでコピーのボタンを押したときだけ使う（DOM を読むのでサーバーでは使えない）

export type ExportFormat = 'text' | 'markdown'

/** 本文に付けた飾り（見出しの「#」、コードの塊の帯）は書き出さない */
const SKIP_SELECTOR = '.heading-anchor, .code-block-bar'

/** リンクや画像の URL を、ほかの場所に貼っても開ける形（https://〜）にする */
function absoluteUrl(url: string) {
  try {
    return new URL(url, window.location.href).href
  } catch {
    return url
  }
}

/** Markdown の記号として読まれてしまう文字を、そのままの文字として書く */
function escapeMarkdown(text: string) {
  return text.replace(/[\\`*_[\]]/g, '\\$&')
}

/** **太字** などで囲む。前後の空白は記号の外に出す（`** 太字**` だと太字にならない） */
function wrap(inner: string, mark: string) {
  const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/)
  if (!m || !m[2]) return inner
  return `${m[1]}${mark}${m[2]}${mark}${m[3]}`
}

/** 中に ` があっても崩れないように、それより長い ` で囲む */
function inlineCode(code: string) {
  const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((s) => s.length))
  const fence = '`'.repeat(longest + 1)
  const pad = code.startsWith('`') || code.endsWith('`') ? ' ' : ''
  return `${fence}${pad}${code}${pad}${fence}`
}

function inline(node: Node, format: ExportFormat): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    return format === 'markdown' ? escapeMarkdown(text) : text
  }
  if (!(node instanceof Element) || node.matches(SKIP_SELECTOR)) return ''

  const children = () =>
    Array.from(node.childNodes, (child) => inline(child, format)).join('')
  const md = format === 'markdown'

  switch (node.tagName) {
    case 'BR':
      return md ? '  \n' : '\n'
    case 'STRONG':
    case 'B':
      return md ? wrap(children(), '**') : children()
    case 'EM':
    case 'I':
      return md ? wrap(children(), '*') : children()
    case 'S':
    case 'DEL':
      return md ? wrap(children(), '~~') : children()
    case 'CODE':
      return md ? inlineCode(node.textContent ?? '') : (node.textContent ?? '')
    case 'IMG': {
      if (!md) return ''
      const src = node.getAttribute('src')
      return src
        ? `![${escapeMarkdown(node.getAttribute('alt') ?? '')}](${absoluteUrl(src)})`
        : ''
    }
    case 'A': {
      const text = children()
      const href = node.getAttribute('href')
      if (!href) return text
      const url = absoluteUrl(href)
      if (md) return `[${text}](${url})`
      // プレーンテキストでは URL が消えないよう、文字と違うときは後ろに添える
      return text.trim() === url || text.trim() === href
        ? text
        : `${text}（${url}）`
    }
    default:
      return children()
  }
}

/** コードの塊。中に ``` があっても崩れないように、それより長い ` で囲む */
function codeBlock(pre: Element, format: ExportFormat) {
  const code = pre.querySelector('code') ?? pre
  const text = (code.textContent ?? '').replace(/\n$/, '')
  if (format === 'text') return text
  const lang = code.className.match(/language-([\w+#.-]+)/)?.[1] ?? ''
  const longest = Math.max(
    0,
    ...(text.match(/`{3,}/g) ?? []).map((s) => s.length),
  )
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}${lang}\n${text}\n${fence}`
}

/** 箇条書き。2 段目以降は、印の幅だけ字下げする */
function list(el: Element, format: ExportFormat) {
  const ordered = el.tagName === 'OL'
  let n = Number(el.getAttribute('start') ?? 1) || 1
  const items: string[] = []
  for (const li of Array.from(el.children)) {
    if (li.tagName !== 'LI') continue
    const marker = ordered ? `${n++}. ` : format === 'markdown' ? '- ' : '・'
    const indent = ' '.repeat(format === 'markdown' ? marker.length : 2)
    const [first = '', ...rest] = blocks(li, format).join('\n').split('\n')
    items.push(
      [
        marker + first,
        ...rest.map((line) => (line ? indent + line : line)),
      ].join('\n'),
    )
  }
  return items.join('\n')
}

/** 段落・見出し・箇条書きなどの塊を、上から順に文字列にする */
function blocks(container: Element, format: ExportFormat): string[] {
  const out: string[] = []
  const md = format === 'markdown'
  // 塊の外に直接書かれた文字（li の中で段落に入っていない文字など）をまとめておく
  let loose = ''
  const flush = () => {
    if (loose.trim()) out.push(loose.trim())
    loose = ''
  }

  for (const node of Array.from(container.childNodes)) {
    if (!(node instanceof Element)) {
      loose += inline(node, format)
      continue
    }
    if (node.matches(SKIP_SELECTOR)) continue
    const tag = node.tagName

    if (/^(STRONG|B|EM|I|S|DEL|CODE|A|SPAN|BR|U|MARK)$/.test(tag)) {
      loose += inline(node, format)
      continue
    }
    flush()

    switch (tag) {
      case 'P': {
        const text = inline(node, format).trim()
        if (text) out.push(text)
        break
      }
      case 'H1':
      case 'H2':
      case 'H3':
      case 'H4':
      case 'H5':
      case 'H6': {
        const text = inline(node, format).trim()
        if (text) out.push(md ? `${'#'.repeat(Number(tag[1]))} ${text}` : text)
        break
      }
      case 'UL':
      case 'OL':
        out.push(list(node, format))
        break
      case 'BLOCKQUOTE': {
        const inner = blocks(node, format).join('\n\n')
        out.push(
          md
            ? inner
                .split('\n')
                .map((line) => (line ? `> ${line}` : '>'))
                .join('\n')
            : inner,
        )
        break
      }
      case 'PRE':
        out.push(codeBlock(node, format))
        break
      case 'HR':
        if (md) out.push('---')
        break
      case 'IMG': {
        const image = inline(node, format)
        if (image) out.push(image)
        break
      }
      default:
        // .code-block などの入れ物は、中身をそのまま塊として読む
        out.push(...blocks(node, format))
    }
  }
  flush()
  return out
}

/** 記事のタイトルと本文を、コピー用の文字列にする */
export function articleToString(
  body: Element,
  format: ExportFormat,
  title: string,
) {
  const heading = format === 'markdown' ? `# ${escapeMarkdown(title)}` : title
  return `${[heading, ...blocks(body, format)].join('\n\n').replace(/\n{3,}/g, '\n\n')}\n`
}
