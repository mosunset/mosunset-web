import { Link } from '@tanstack/react-router'

import { SocialIcon } from '@/components/social-icons'
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
          <p>
            © {year} {site.name}
          </p>
        </div>

        <nav className="grid grid-cols-2 content-start gap-x-8 gap-y-2 sm:grid-cols-3">
          {mainNav.map((item) => (
            <Link key={item.to} to={item.to} className="hover:text-foreground">
              {item.title}
            </Link>
          ))}
          <Link
            to={contactNav.to}
            className="font-medium text-foreground hover:underline"
          >
            {contactNav.title}
          </Link>
        </nav>
      </div>
    </footer>
  )
}
