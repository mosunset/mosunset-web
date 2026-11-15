import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const HOUR = 3_600_000
const STORAGE_KEY = 'mosunset:playground:autophagy'

type Settings = { startHour: number; eatingHours: number }
const defaults: Settings = { startHour: 12, eatingHours: 8 }

type Phase = { label: string; color: string; ring: string }

/** 断食の経過時間ごとの段階 */
function fastingPhase(progress: number): Phase {
  if (progress < 25)
    return {
      label: '最初の 4 時間',
      color: 'text-sky-500',
      ring: 'stroke-sky-500',
    }
  if (progress < 50)
    return {
      label: '4〜8 時間',
      color: 'text-amber-500',
      ring: 'stroke-amber-500',
    }
  if (progress < 75)
    return {
      label: '8〜12 時間',
      color: 'text-orange-500',
      ring: 'stroke-orange-500',
    }
  return {
    label: '12 時間以上（オートファジーが活発になる時間帯）',
    color: 'text-rose-500',
    ring: 'stroke-rose-500',
  }
}

function calc(now: Date, { startHour, eatingHours }: Settings) {
  const fastingHours = 24 - eatingHours
  const eatStart = new Date(now)
  eatStart.setHours(startHour, 0, 0, 0)
  // 0 時をまたぐ設定でも、今日か昨日の「食事の開始」を基準にする
  if (eatStart > now) eatStart.setDate(eatStart.getDate() - 1)
  const eatEnd = new Date(eatStart.getTime() + eatingHours * HOUR)

  if (now < eatEnd) {
    const elapsed = now.getTime() - eatStart.getTime()
    return {
      fasting: false,
      remaining: eatEnd.getTime() - now.getTime(),
      progress: Math.min(100, (elapsed / (eatingHours * HOUR)) * 100),
    }
  }
  const nextStart = new Date(eatStart.getTime() + 24 * HOUR)
  const elapsed = now.getTime() - eatEnd.getTime()
  return {
    fasting: true,
    remaining: nextStart.getTime() - now.getTime(),
    progress: Math.min(100, (elapsed / (fastingHours * HOUR)) * 100),
  }
}

function hms(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((v) => String(v).padStart(2, '0'))
    .join(':')
}

const hours = Array.from({ length: 24 }, (_, i) => i)

const pad = (h: number) => `${String(((h % 24) + 24) % 24).padStart(2, '0')}:00`

export function AutophagyClock() {
  const [now, setNow] = useState(() => new Date())
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      return {
        ...defaults,
        ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'),
      }
    } catch {
      return defaults
    }
  })

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  const state = calc(now, settings)
  const phase: Phase = state.fasting
    ? fastingPhase(state.progress)
    : {
        label: '食事の時間です',
        color: 'text-emerald-500',
        ring: 'stroke-emerald-500',
      }

  const radius = 52
  const circumference = 2 * Math.PI * radius

  return (
    <div className="space-y-8">
      <div className="rounded-xl border p-6 text-center sm:p-8">
        <p className="text-sm text-muted-foreground">
          食事 {pad(settings.startHour)}〜
          {pad(settings.startHour + settings.eatingHours)} ／ 断食{' '}
          {pad(settings.startHour + settings.eatingHours)}〜
          {pad(settings.startHour)}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">現在時刻</p>
        <p className="font-mono text-3xl font-bold tabular-nums sm:text-4xl">
          {now.toLocaleTimeString('ja-JP')}
        </p>

        <div className="relative mx-auto mt-6 size-64">
          <svg
            viewBox="0 0 120 120"
            className="size-full -rotate-90"
            aria-hidden="true"
          >
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              strokeWidth="8"
              className="stroke-muted"
            />
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - state.progress / 100)}
              className={cn(
                'transition-[stroke-dashoffset] duration-500',
                phase.ring,
              )}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {state.fasting ? '食事の時間まで' : '断食の時間まで'}
            </p>
            <p className="font-mono text-3xl font-bold tabular-nums sm:text-4xl">
              {hms(state.remaining)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {Math.floor(state.progress)}%
            </p>
          </div>
        </div>

        <p className={cn('mt-6 text-lg font-semibold', phase.color)}>
          {state.fasting ? `断食中：${phase.label}` : phase.label}
        </p>
      </div>

      <fieldset className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-medium">時間帯の設定</legend>
        <div className="space-y-2">
          <Label htmlFor="start-hour">食事を始める時刻</Label>
          <select
            id="start-hour"
            value={settings.startHour}
            onChange={(e) =>
              setSettings((s) => ({ ...s, startHour: Number(e.target.value) }))
            }
            className="h-10 w-full rounded-lg border bg-transparent px-2.5 text-base md:h-8 md:text-sm"
          >
            {hours.map((h) => (
              <option key={h} value={h}>
                {pad(h)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="eating-hours">食事の時間（断食は残り）</Label>
          <select
            id="eating-hours"
            value={settings.eatingHours}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                eatingHours: Number(e.target.value),
              }))
            }
            className="h-10 w-full rounded-lg border bg-transparent px-2.5 text-base md:h-8 md:text-sm"
          >
            {[4, 6, 8, 10, 12].map((h) => (
              <option key={h} value={h}>
                {h} 時間（断食 {24 - h} 時間）
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <p className="text-center text-sm text-muted-foreground">
        オートファジーについては{' '}
        <Link
          to="/blog/$slug"
          params={{ slug: 'autophagy' }}
          className="underline"
        >
          ブログの記事
        </Link>
        で詳しく書いています。
      </p>
    </div>
  )
}
