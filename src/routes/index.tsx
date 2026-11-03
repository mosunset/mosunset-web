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
import { contactNav, mainNav } from '@/lib/navigation'
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
      <Contact />
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
        {/* TODO: キャッチコピーを書く */}
        <p className="text-lg text-muted-foreground">
          作ったもの、書いたこと、集めているもの。
        </p>
      </div>
      <div className="flex gap-3">
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

function About() {
  return (
    <section id="about" className="scroll-mt-20 border-t py-16">
      <h2 className="text-2xl font-bold">About</h2>
      {/* TODO: 自己紹介を書く */}
      <div className="mt-6 space-y-4 leading-relaxed">
        <p>ここに自己紹介を書きます。</p>
        <p>得意なこと、好きなこと、経歴などを数段落で。</p>
      </div>
    </section>
  )
}

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

function Contact() {
  return (
    <section id="contact" className="scroll-mt-20 border-t py-16 text-center">
      <h2 className="text-2xl font-bold">Contact</h2>
      <p className="mt-4 text-muted-foreground">{contactNav.description}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link to={contactNav.to}>{contactNav.title}</Link>
        </Button>
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
