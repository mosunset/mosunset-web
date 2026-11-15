import { Monitor, Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  setTheme,
  type Theme,
  themeLabels,
  themes,
  useTheme,
} from '@/lib/theme'
import { cn } from '@/lib/utils'

const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const

/**
 * 今の明るさのアイコン。サーバーの HTML でも正しく出るよう、<html> の dark クラスで出し分ける
 * （どちらを選んでいるかはブラウザでしか分からない）
 */
function ResolvedThemeIcon() {
  return (
    <>
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </>
  )
}

/** ヘッダーの、画面の明るさを選ぶボタン */
export function ThemeMenu({ className }: { className?: string }) {
  const theme = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className}
          aria-label="画面の明るさ"
        >
          <ResolvedThemeIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>画面の明るさ</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as Theme)}
        >
          {themes.map((t) => {
            const Icon = themeIcons[t]
            return (
              <DropdownMenuRadioItem key={t} value={t}>
                <Icon />
                {themeLabels[t]}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 3 つ並べて選ぶ形（サイドバーの下など、場所に余裕があるところ用） */
export function ThemeSwitch({ className }: { className?: string }) {
  const theme = useTheme()

  return (
    <fieldset
      className={cn('flex rounded-lg border bg-background p-0.5', className)}
    >
      <legend className="sr-only">画面の明るさ</legend>
      {themes.map((t) => {
        const Icon = themeIcons[t]
        const selected = theme === t
        return (
          <button
            key={t}
            type="button"
            aria-pressed={selected}
            title={themeLabels[t]}
            onClick={() => setTheme(t)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-3.5',
              selected && 'bg-accent font-medium text-foreground',
            )}
          >
            <Icon aria-hidden="true" />
            {t === 'system' ? '自動' : themeLabels[t]}
          </button>
        )
      })}
    </fieldset>
  )
}
