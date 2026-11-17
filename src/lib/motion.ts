import * as React from 'react'

/**
 * GSAP で付ける動き（スクロールで出てくる・トップの上の欄がスクロールで遠のく）。
 *
 * GSAP は最初の表示に要らないので、ページを描いて手が空いてから読む（Lighthouse の点数を落とさないように）。
 * 動かす前の形（薄い・少し下）は、読み込んだあとに JavaScript で付ける。だから JavaScript が
 * 動かないときや、読み込む前は、ふつうに全部見えている。
 * OS で「視差効果を減らす」をオンにしている人には、どれも動かさない
 */

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

let gsapPromise: Promise<typeof import('gsap').gsap> | undefined
function loadGsap() {
  gsapPromise ??= import('gsap').then((m) => m.gsap)
  return gsapPromise
}

let scrollTriggerPromise:
  | Promise<{
      gsap: typeof import('gsap').gsap
      ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger
    }>
  | undefined
function loadScrollTrigger() {
  scrollTriggerPromise ??= Promise.all([
    loadGsap(),
    import('gsap/ScrollTrigger'),
  ]).then(([gsap, { ScrollTrigger }]) => {
    gsap.registerPlugin(ScrollTrigger)
    return { gsap, ScrollTrigger }
  })
  return scrollTriggerPromise
}

/** ブラウザの手が空いたら（無い環境では少し待って）呼ぶ。返り値で取り消せる */
function whenIdle(fn: () => void) {
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(fn, { timeout: 1500 })
    return () => window.cancelIdleCallback(id)
  }
  const id = setTimeout(fn, 200)
  return () => clearTimeout(id)
}

/** スクロールで出てくるもの。`data-reveal` の要素と、`data-reveal-children` の子 */
const REVEAL_SELECTOR = '[data-reveal], [data-reveal-children] > *'

/**
 * スクロールして画面に入ったところで、ふわっと出てくるようにする（サイト全体。src/components/layout/site-shell.tsx）。
 *
 * - 最初から画面に見えているものは動かさない（開いたときにちらつかないように）
 * - スクロールするたびに位置を見て、画面の下の端に入ったものを出す。一気にスクロールして
 *   上へ通り過ぎたものも出す（IntersectionObserver は、画面に一度も入らずに飛び越えると知らせてこないため）
 * - `key` が変わったら（ページや絞り込みが変わったら）やり直す
 */
export function useScrollReveal(key: string) {
  React.useEffect(() => {
    // 依存に入れているのは、ページが変わったらやり直すため
    void key
    if (prefersReducedMotion()) return

    let cancelled = false
    let hidden: HTMLElement[] = []
    let gsap: typeof import('gsap').gsap | undefined
    let frame = 0

    const reveal = () => {
      frame = 0
      if (!gsap) return
      // 下の端から少し入ったもの（上へ通り過ぎたものも含む）
      const limit = window.innerHeight - 24
      const entering = hidden.filter(
        (el) => el.getBoundingClientRect().top < limit,
      )
      if (entering.length === 0) return
      for (const el of entering) el.dataset.revealed = ''
      hidden = hidden.filter((el) => !entering.includes(el))
      gsap.to(entering, {
        opacity: 1,
        y: 0,
        duration: 0.7,
        ease: 'power3.out',
        stagger: 0.07,
        clearProps: 'opacity,transform',
      })
      if (hidden.length === 0) stopListening()
    }
    const onScroll = () => {
      frame ||= requestAnimationFrame(reveal)
    }
    const stopListening = () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }

    const cancelIdle = whenIdle(async () => {
      gsap = await loadGsap()
      if (cancelled) return
      // 画面より下にあって、まだ出していないものだけ
      hidden = [
        ...document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR),
      ].filter(
        (el) =>
          !el.dataset.revealed &&
          el.getBoundingClientRect().top > window.innerHeight,
      )
      if (hidden.length === 0) return
      gsap.set(hidden, { opacity: 0, y: 28 })
      window.addEventListener('scroll', onScroll, { passive: true })
      window.addEventListener('resize', onScroll, { passive: true })
    })

    return () => {
      cancelled = true
      cancelIdle()
      stopListening()
      if (frame) cancelAnimationFrame(frame)
      // まだ出していないものは、見える形に戻しておく（やり直したときに、改めて選ぶ）
      if (gsap && hidden.length > 0) {
        gsap.killTweensOf(hidden)
        gsap.set(hidden, { clearProps: 'opacity,transform' })
      }
    }
  }, [key])
}

/**
 * トップページの上の欄。スクロールして欄が上へ抜けていくあいだ、
 * アイコンは少しゆっくり上がって小さくなり、文字は少し遅れて薄くなる（スクロールの量に合わせて動く）
 */
export function useHeroScroll(ref: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const hero = ref.current
    if (!hero || prefersReducedMotion()) return

    let cancelled = false
    let revert: (() => void) | undefined

    const cancelIdle = whenIdle(async () => {
      const { gsap } = await loadScrollTrigger()
      if (cancelled) return
      const ctx = gsap.context(() => {
        const timeline = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: hero,
            start: 'top top',
            end: 'bottom top',
            scrub: 0.6,
          },
        })
        timeline
          .to('[data-hero-icon]', { yPercent: 35, scale: 0.8, rotate: -8 }, 0)
          .to('[data-hero-text]', { y: 60, opacity: 0.2 }, 0)
      }, hero)
      revert = () => ctx.revert()
    })

    return () => {
      cancelled = true
      cancelIdle()
      revert?.()
    }
  }, [ref])
}
