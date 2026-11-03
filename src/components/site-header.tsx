import { Link } from '@tanstack/react-router'

import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { site } from '@/lib/site'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 flex h-(--header-height) w-full shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      <Link to="/" className="flex items-center gap-2 font-semibold">
        <img
          src={site.image.path}
          alt=""
          width={28}
          height={28}
          className="size-7 rounded-full object-cover"
        />
        {site.name}
      </Link>
    </header>
  )
}
