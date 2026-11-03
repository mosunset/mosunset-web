import { Link } from '@tanstack/react-router'

import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 flex h-(--header-height) w-full shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      <Link to="/" className="font-semibold">
        mosunset
      </Link>
    </header>
  )
}
