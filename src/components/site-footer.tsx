import { Link } from '@tanstack/react-router'

import { SocialIcon } from '@/components/social-icons'
import { site } from '@/lib/site'

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t px-4 py-6 text-sm text-muted-foreground">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {year} {site.name}
        </p>
        <div className="flex items-center gap-4">
          <nav className="flex gap-4">
            <Link to="/" className="hover:text-foreground">
              ホーム
            </Link>
            <Link to="/about" className="hover:text-foreground">
              このサイトについて
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            {site.social.map((s) => (
              <a
                key={s.name}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer me"
                aria-label={s.name}
                className="hover:text-foreground"
              >
                <SocialIcon name={s.name} className="size-4" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
