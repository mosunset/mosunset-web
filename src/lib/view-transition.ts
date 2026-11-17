import type * as React from 'react'

/**
 * ページを移るときの動き（View Transitions）。
 *
 * - ページ全体は、ルーターの defaultViewTransition（src/router.tsx）で軽く入れ替わる。
 *   動き方は src/styles.css の「ページを移るときの動き」
 * - 一覧の写真をクリックすると、その写真が詳細ページの大きい写真まで伸びて移る（逆に戻るときも）。
 *   一覧の写真には `sharedImageProps(...)`（data-vt）を、詳細ページの写真には
 *   `sharedImageProps(..., { fixed: true })` を付けておく
 *
 * view-transition-name は同じページに 2 つあると動きが丸ごと止まるので、一覧の側は
 * いつも付けておかず、動く直前に 1 つだけ付ける（installSharedTransitions）。
 * 詳細ページの写真は 1 つしかないので、いつも付けておく
 */

/** 写真ごとの名前。CSS の名前に使えない文字は _ にする（数字で始まらないように vt- を付ける） */
export function sharedName(...parts: string[]) {
  return `vt-${parts.join('-')}`.replace(/[^\w\-\u0080-￿]/g, '_')
}

/** 写真の枠に付ける属性 */
export function sharedImageProps(
  name: string,
  { fixed = false }: { fixed?: boolean } = {},
): React.HTMLAttributes<HTMLElement> & Record<`data-${string}`, string> {
  return fixed
    ? {
        'data-vt': name,
        'data-vt-fixed': '',
        style: {
          viewTransitionName: name,
          viewTransitionClass: 'shared',
        } as React.CSSProperties,
      }
    : { 'data-vt': name }
}

const TEMP = 'data-vt-temp'

function nameTemporarily(el: HTMLElement) {
  el.style.setProperty('view-transition-name', el.dataset.vt ?? '')
  el.style.setProperty('view-transition-class', 'shared')
  el.setAttribute(TEMP, '')
}

function clearTemporaryNames() {
  for (const el of document.querySelectorAll<HTMLElement>(`[${TEMP}]`)) {
    el.style.removeProperty('view-transition-name')
    el.style.removeProperty('view-transition-class')
    el.removeAttribute(TEMP)
  }
}

let installed = false

type RouterLike = {
  subscribe: (
    event: 'onBeforeNavigate' | 'onRendered',
    fn: () => void,
  ) => () => void
}

/** 押されたときに、クリックを渡す先（押した場所にある、押せるもの） */
const CLICKABLE =
  'a[href], button, input, select, textarea, label, summary, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])'

/**
 * 動いているあいだも、ボタンやリンクを押せるようにする。
 *
 * View Transitions が動いているあいだ、ブラウザはクリックをページの中身ではなく <html> に届ける
 * （CSS の pointer-events では下に通せない）。そこで、動きの途中に押されたら、動きをすぐ終わらせて、
 * 押した場所にあるボタンやリンクに同じクリックを渡す。ページを移る動きも、拡大表示の動きも同じ
 */
function passClicksThroughTransitions() {
  let active: ViewTransition | null = null
  const start = document.startViewTransition.bind(document)
  document.startViewTransition = ((
    arg?: Parameters<typeof document.startViewTransition>[0],
  ) => {
    const transition = start(arg)
    active = transition
    transition.finished.finally(() => {
      if (active === transition) active = null
    })
    return transition
  }) as typeof document.startViewTransition

  document.addEventListener(
    'click',
    (event) => {
      if (!active || event.target !== document.documentElement) return
      event.preventDefault()
      event.stopImmediatePropagation()
      const { clientX: x, clientY: y } = event
      active.skipTransition()
      active = null
      // 動きの絵が消えてから、押した場所にあるものを探す
      requestAnimationFrame(() => {
        const hit = document.elementFromPoint(x, y)
        const target = hit?.closest<HTMLElement>(CLICKABLE) ?? null
        if (!target) return
        target.focus({ preventScroll: true })
        target.click()
      })
    },
    true,
  )
}

/**
 * 一覧 ⇄ 詳細の写真をつなぐ。ブラウザで 1 回だけ呼ぶ（src/router.tsx）
 *
 * - 一覧で写真の入ったリンクを押したら、その写真に名前を付ける（前のページの側）
 * - 詳細ページから離れるときは、その写真の名前を覚えておき、次のページで同じ写真を
 *   最初の 1 つだけ探して名前を付ける（一覧へ戻るとき。ブラウザの「戻る」も）
 */
export function installSharedTransitions(router: RouterLike) {
  if (typeof document === 'undefined') return
  if (typeof document.startViewTransition !== 'function') return
  // ルーターを作り直したとき（開発中の差し替えなど）に、クリックの見張りが重ならないように
  if (installed) return
  installed = true

  passClicksThroughTransitions()

  let returning: string | null = null

  // ルーターが遷移を始めるより前に名前を付けたいので、キャプチャで拾う
  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }
      const link = (event.target as Element | null)?.closest?.('a')
      if (!link) return
      clearTemporaryNames()
      const image = link.querySelector<HTMLElement>('[data-vt]')
      if (image && !image.hasAttribute('data-vt-fixed')) {
        nameTemporarily(image)
      }
    },
    true,
  )

  router.subscribe('onBeforeNavigate', () => {
    returning =
      document.querySelector<HTMLElement>('[data-vt-fixed]')?.dataset.vt ?? null
  })

  // onRendered は新しいページを描いたあと、ブラウザが新しい画面を写し取る前に来る
  router.subscribe('onRendered', () => {
    if (!returning) return
    const target = document.querySelector<HTMLElement>(
      `[data-vt="${CSS.escape(returning)}"]:not([data-vt-fixed])`,
    )
    returning = null
    if (target) nameTemporarily(target)
  })
}
