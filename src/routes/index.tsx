import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, ImageOff } from 'lucide-react'
import * as React from 'react'
import { SocialIcon } from '@/components/layout/social-icons'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getHomeFeed } from '@/functions/home'
import { collections, imageFitOf } from '@/lib/collections/config'
import { formatDate, formatDay } from '@/lib/format'
import { thumbnailUrl } from '@/lib/images'
import { useHeroScroll } from '@/lib/motion'
import { mainNav } from '@/lib/navigation'
import { publicTools } from '@/lib/playground/tools'
import { seo } from '@/lib/seo'
import { site } from '@/lib/site'
import { cn } from '@/lib/utils'
import { sharedImageProps, sharedName } from '@/lib/view-transition'

export const Route = createFileRoute('/')({
  head: () => ({ meta: seo({ description: site.description }) }),
  loader: () => getHomeFeed(),
  component: Home,
})

function Home() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6">
      <Hero />
      <Latest />
      <About />
      <Contents />
      <Links />
    </div>
  )
}

/** 上の欄の文字が順に出てくるときの、遅れ（src/styles.css の .hero-rise） */
function heroDelay(ms: number) {
  return { '--hero-delay': `${ms}ms` } as React.CSSProperties
}

function Hero() {
  const heroRef = React.useRef<HTMLElement>(null)
  useHeroScroll(heroRef)
  return (
    <section
      ref={heroRef}
      className="flex flex-col items-center gap-6 py-20 text-center"
    >
      <img
        src={site.icon.medium}
        alt={site.image.alt}
        width={160}
        height={160}
        fetchPriority="high"
        data-hero-icon
        className="hero-pop size-40 rounded-full object-cover shadow-lg"
      />
      {/* 文字とボタンはまとめて動かす（スクロールで下へずれるとき、重ならないように） */}
      <div data-hero-text className="flex flex-col items-center gap-6">
        <div className="space-y-3">
          <h1 className="hero-rise text-5xl font-bold tracking-tight">
            {site.name}
          </h1>
          <p className="hero-rise text-xl font-medium" style={heroDelay(120)}>
            {site.tagline}
          </p>
          <p className="hero-rise text-muted-foreground" style={heroDelay(220)}>
            作ったもの、書いたこと、集めているものを置いています。
          </p>
        </div>
        <div
          className="hero-slide flex flex-wrap justify-center gap-3"
          style={heroDelay(200)}
        >
          <Button asChild>
            <Link to="/blog">ブログを読む</Link>
          </Button>
          <Button asChild variant="outline">
            <a href="#about">自己紹介</a>
          </Button>
        </div>
      </div>
    </section>
  )
}

/** 欄の見出し。英語を大きく、その下に日本語を小さく添える */
function SectionHeading({ en, ja }: { en: string; ja: string }) {
  return (
    <h2>
      <span className="block text-2xl font-bold">{en}</span>
      <span className="mt-1 block text-sm font-medium text-muted-foreground">
        {ja}
      </span>
    </h2>
  )
}

/** 新しいツール（公開日の新しい順。同じ日は登録した順） */
const latestTools = [...publicTools]
  .sort((a, b) => b.publishedDate.localeCompare(a.publishedDate))
  .slice(0, 3)

/** 新しいもの（最新の記事・新しいツール・最近登録したもの）。来るたびに変わるところ */
function Latest() {
  const feed = Route.useLoaderData()
  return (
    <section id="latest" data-reveal className="scroll-mt-20 border-t py-16">
      <SectionHeading en="Latest" ja="新着" />
      <div className="mt-6 grid gap-10 md:grid-cols-2">
        {feed.posts.length > 0 && (
          <LatestColumn
            title="最新の記事"
            moreTo="/blog"
            moreLabel="記事の一覧へ"
          >
            {feed.posts.map((post) => (
              <LatestRow
                key={post.slug}
                link={
                  <Link
                    to="/blog/$slug"
                    params={{ slug: post.slug }}
                    className="after:absolute after:inset-0 after:content-['']"
                  >
                    {post.title}
                  </Link>
                }
                image={thumbnailUrl(post.coverImageKey)}
                shared={sharedName('post', post.slug)}
                meta={
                  post.publishedAt && (
                    <time dateTime={new Date(post.publishedAt).toISOString()}>
                      {formatDate(new Date(post.publishedAt))}
                    </time>
                  )
                }
              />
            ))}
          </LatestColumn>
        )}
        <LatestColumn
          title="新しいツール"
          moreTo="/playground"
          moreLabel="ツールの一覧へ"
        >
          {latestTools.map((tool) => (
            <LatestRow
              key={tool.slug}
              link={
                <Link
                  to="/playground/$slug"
                  params={{ slug: tool.slug }}
                  className="after:absolute after:inset-0 after:content-['']"
                >
                  {tool.name}
                </Link>
              }
              image={tool.thumbnail}
              meta={
                <time dateTime={tool.publishedDate}>
                  {formatDay(tool.publishedDate)}
                </time>
              }
            />
          ))}
        </LatestColumn>
      </div>

      {feed.items.length > 0 && (
        <div className="mt-10">
          <h3 className="text-sm font-medium text-muted-foreground">
            最近登録したもの
          </h3>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {feed.items.map((item) => {
              const config = collections[item.kind]
              const src = thumbnailUrl(item.imageKey)
              return (
                <li key={`${item.kind}/${item.slug}`}>
                  <Link
                    to={config.detailPath}
                    params={{ slug: item.slug }}
                    className="group block overflow-hidden rounded-lg border transition-[background-color,box-shadow,translate] duration-300 hover:bg-muted/40 hover:shadow-md motion-safe:hover:-translate-y-1"
                  >
                    <div
                      {...sharedImageProps(sharedName(item.kind, item.slug))}
                      className="flex aspect-square items-center justify-center overflow-hidden border-b bg-muted/30"
                    >
                      {src ? (
                        <img
                          src={src}
                          alt=""
                          loading="lazy"
                          // 一覧のカードと同じ見せ方（箱の写真などは切らずに全体を見せる）
                          className={cn(
                            'size-full',
                            imageFitOf(item.kind) === 'contain'
                              ? 'object-contain'
                              : 'object-cover',
                          )}
                        />
                      ) : (
                        <ImageOff className="size-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="text-xs text-muted-foreground">
                        {config.label}
                      </p>
                      <p className="truncate text-sm font-medium group-hover:underline">
                        {item.title}
                      </p>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}

function LatestColumn({
  title,
  moreTo,
  moreLabel,
  children,
}: {
  title: string
  moreTo: '/blog' | '/playground'
  moreLabel: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <ul className="mt-3 space-y-3">{children}</ul>
      <Link
        to={moreTo}
        className="mt-3 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
      >
        {moreLabel}
        <ArrowRight className="size-4" />
      </Link>
    </div>
  )
}

/** 新しいものの 1 行。名前のリンクを行いっぱいに広げて、どこを押しても開けるようにする */
function LatestRow({
  link,
  image,
  shared,
  meta,
}: {
  link: React.ReactNode
  image: string | null
  /** 記事の詳細の表紙につなぐ名前（src/lib/view-transition.ts） */
  shared?: string
  meta: React.ReactNode
}) {
  return (
    <li className="group relative flex gap-3 rounded-lg border p-2.5 transition-[background-color,box-shadow,translate] duration-300 hover:bg-muted/40 hover:shadow-md motion-safe:hover:-translate-y-0.5">
      <div
        {...(shared && image ? sharedImageProps(shared) : {})}
        className="flex aspect-[1200/630] w-24 shrink-0 items-center justify-center self-start overflow-hidden rounded-md border bg-muted/30"
      >
        {/* 表紙のない記事は、サイトのアイコンを小さく出す */}
        {image ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <img
            src={site.icon.small}
            alt=""
            width={28}
            height={28}
            className="size-7 rounded-full opacity-80"
          />
        )}
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:underline">
          {link}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{meta}</p>
      </div>
    </li>
  )
}

/** 自己紹介（くわしくはブログの記事「学びと開発の自己紹介」） */
function About() {
  return (
    <section id="about" data-reveal className="scroll-mt-20 border-t py-16">
      <SectionHeading en="About" ja="自己紹介" />
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
]

function Contents() {
  return (
    <section id="contents" data-reveal className="scroll-mt-20 border-t py-16">
      <SectionHeading en="Contents" ja="コンテンツ" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mainNav.map((item) => (
          <Link key={item.to} to={item.to} className="group">
            <Card className="h-full transition-[background-color,box-shadow,translate] duration-300 group-hover:bg-muted/50 group-hover:shadow-md motion-safe:group-hover:-translate-y-1">
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
    <section
      id="links"
      data-reveal
      className="scroll-mt-20 border-t py-16 text-center"
    >
      <SectionHeading en="Links" ja="リンク" />
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
