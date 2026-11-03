import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'

import { SocialIcon } from '@/components/social-icons'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { mainNav } from '@/lib/navigation'
import { seo } from '@/lib/seo'
import { site } from '@/lib/site'

export const Route = createFileRoute('/')({
  head: () => ({ meta: seo({ description: site.description }) }),
  component: Home,
})

function Home() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6">
      <Hero />
      <About />
      <Contents />
      <Links />
    </div>
  )
}

function Hero() {
  return (
    <section className="flex flex-col items-center gap-6 py-20 text-center">
      <img
        src={site.image.path}
        alt={site.image.alt}
        width={160}
        height={160}
        className="size-40 rounded-full object-cover shadow-lg"
      />
      <div className="space-y-3">
        <h1 className="text-5xl font-bold tracking-tight">{site.name}</h1>
        <p className="text-xl font-medium">{site.tagline}</p>
        <p className="text-muted-foreground">
          作ったもの、書いたこと、集めているものを置いています。
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link to="/blog">ブログを読む</Link>
        </Button>
        <Button asChild variant="outline">
          <a href="#about">自己紹介</a>
        </Button>
      </div>
    </section>
  )
}

/** 自己紹介（くわしくはブログの記事「学びと開発の自己紹介」） */
function About() {
  return (
    <section id="about" className="scroll-mt-20 border-t py-16">
      <h2 className="text-2xl font-bold">About</h2>
      <div className="mt-6 grid gap-8 md:grid-cols-[2fr_1fr]">
        <div className="space-y-4 leading-relaxed">
          <p>
            岐阜県を拠点に、会社員として働きながら、趣味で Web
            アプリや小さなツールを作っています。中学生の頃に Scratch
            や電子工作に触れて、「自分で仕組みを作る面白さ」を知ったのが始まりです。
          </p>
          <p>
            日常で気づいた「ちょっとした不便」を流さず、小さなツールとして形にするのが好きです。代表作は、YouTube
            の再生ページにサムネイルを表示する Chrome 拡張機能「YouTube Watch
            Thumbnails」で、約 7,000 人に使ってもらっています。
          </p>
          <p>
            ほかに、資格の勉強、吹奏楽、料理も楽しんでいます。基本は「作りたいから作る」ゆるいスタイルです。
          </p>
          <Link
            to="/blog/$slug"
            params={{ slug: 'about' }}
            className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
          >
            くわしい自己紹介を読む
            <ArrowRight className="size-4" />
          </Link>
        </div>
        <dl className="h-fit space-y-3 rounded-lg border p-4 text-sm">
          {aboutFacts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-xs text-muted-foreground">{fact.label}</dt>
              <dd className="mt-0.5">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

const aboutFacts = [
  { label: '拠点', value: '岐阜県' },
  { label: 'しごと', value: '会社員' },
  { label: 'よく使う技術', value: 'TypeScript・React・Next.js・Astro・Python' },
  {
    label: '好きなこと',
    value: '小さなツール作り・自動化・吹奏楽・料理',
  },
  {
    label: '学習中',
    value: 'データベーススペシャリスト・情報処理安全確保支援士',
  },
]

function Contents() {
  return (
    <section id="contents" className="scroll-mt-20 border-t py-16">
      <h2 className="text-2xl font-bold">Contents</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mainNav.map((item) => (
          <Link key={item.to} to={item.to} className="group">
            <Card className="h-full transition-colors group-hover:bg-muted/50">
              <CardHeader>
                <item.icon className="mb-2 size-6 text-muted-foreground" />
                <CardTitle className="flex items-center gap-1">
                  {item.title}
                  <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}

/** SNS へのリンク（お問い合わせは目立たせないので、ここには置かない） */
function Links() {
  return (
    <section id="links" className="scroll-mt-20 border-t py-16 text-center">
      <h2 className="text-2xl font-bold">Links</h2>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {site.social.map((s) => (
          <Button key={s.name} asChild variant="outline">
            <a href={s.url} target="_blank" rel="noopener noreferrer me">
              <SocialIcon name={s.name} className="size-4" />
              {s.name}
            </a>
          </Button>
        ))}
      </div>
    </section>
  )
}
