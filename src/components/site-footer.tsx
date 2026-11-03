import { Link } from '@tanstack/react-router'

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t px-4 py-6 text-sm text-muted-foreground">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p>© {year} mosunset</p>
        <nav className="flex gap-4">
          <Link to="/" className="hover:text-foreground">
            ホーム
          </Link>
          <Link to="/about" className="hover:text-foreground">
            このサイトについて
          </Link>
        </nav>
      </div>
    </footer>
  )
}
