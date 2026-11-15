import { Link } from '@tanstack/react-router'

import { SocialIcon } from '@/components/layout/social-icons'
import { contactNav, mainNav } from '@/lib/navigation'
import { site } from '@/lib/site'

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t text-sm text-muted-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8 sm:flex-row sm:justify-between">
        <div className="space-y-3">
          <Link to="/" className="font-semibold text-foreground">
            {site.name}
          </Link>
          {/* 押せる範囲は 32px（アイコンは 16px のまま。スマホで押しやすく、Lighthouse のタップの大きさの基準も満たす） */}
          <div className="-ml-2 flex items-center gap-1">
            {site.social.map((s) => (
              <a
                key={s.name}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer me"
                aria-label={s.name}
                className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted hover:text-foreground"
              >
                <SocialIcon name={s.name} className="size-4" />
              </a>
            ))}
          </div>
          <p>
            © {year} {site.name}
            {/* お問い合わせは目立たせず、ここに小さく置くだけにする */}
            <span aria-hidden="true"> · </span>
            <Link to={contactNav.to} className="hover:text-foreground">
              {contactNav.title}
            </Link>
            <span aria-hidden="true"> · </span>
            <a href="/rss.xml" className="hover:text-foreground">
              RSS
            </a>
          </p>
        </div>

        <nav
          aria-label="フッターのメニュー"
          className="grid grid-cols-2 content-start gap-x-8 gap-y-2 sm:grid-cols-3"
        >
          {mainNav.map((item) => (
            <Link key={item.to} to={item.to} className="hover:text-foreground">
              {item.title}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
