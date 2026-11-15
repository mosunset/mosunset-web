import { useSyncExternalStore } from 'react'

/**
 * 画面の明るさ（ライト・ダーク）。選んだものはこのブラウザの localStorage に覚える。
 * 何も選んでいなければ、端末の設定（prefers-color-scheme）に合わせる
 */
export const themes = ['light', 'dark', 'system'] as const
export type Theme = (typeof themes)[number]

export const themeLabels: Record<Theme, string> = {
  light: 'ライト',
  dark: 'ダーク',
  system: '端末に合わせる',
}

const STORAGE_KEY = 'theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

/** ブラウザの上の帯の色（styles.css の --background と同じ） */
export const themeColors = { light: '#ffffff', dark: '#0a0a0a' } as const

/**
 * <head> で、画面を描く前に動かすスクリプト。
 * ダークのときに、いったん白い画面が出てから暗くなる（白く光る）のを防ぐ。
 * 中身は applyTheme と同じことをしている
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');var d=t==='dark'||(t!=='light'&&matchMedia('${DARK_QUERY}').matches);var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';var c=d?'${themeColors.dark}':'${themeColors.light}';document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.content=c})}catch(_){}})()`

function readTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

function isDark(theme: Theme) {
  return (
    theme === 'dark' || (theme === 'system' && matchMedia(DARK_QUERY).matches)
  )
}

/** 今の設定を <html> に反映する（dark クラス・フォームなどの色・ブラウザの上の帯の色） */
function applyTheme() {
  const dark = isDark(readTheme())
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )) {
    meta.content = themeColors[dark ? 'dark' : 'light']
  }
}

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setTheme(theme: Theme) {
  try {
    if (theme === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // 保存できないブラウザでも、今開いているページには反映する
  }
  applyTheme()
  for (const listener of listeners) listener()
}

/** 選んでいる設定（ライト・ダーク・端末に合わせる）。サーバーでは「端末に合わせる」 */
export function useTheme() {
  return useSyncExternalStore(subscribe, readTheme, () => 'system' as Theme)
}

/** 実際に出している明るさ（「端末に合わせる」なら端末の設定）。サーバーではライト */
export function useResolvedTheme() {
  return useSyncExternalStore(
    subscribe,
    () => (isDark(readTheme()) ? 'dark' : 'light'),
    () => 'light' as const,
  )
}

/**
 * 端末の設定が変わったとき（夜になって自動でダークになった など）と、
 * ほかのタブで設定を変えたときに、このページにも反映する。root で 1 回だけ呼ぶ
 */
export function watchTheme() {
  const media = matchMedia(DARK_QUERY)
  const onChange = () => {
    applyTheme()
    for (const listener of listeners) listener()
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) onChange()
  }
  media.addEventListener('change', onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    media.removeEventListener('change', onChange)
    window.removeEventListener('storage', onStorage)
  }
}
