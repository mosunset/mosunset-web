import { createFileRoute } from '@tanstack/react-router'

import { SectionPage } from '@/components/section-page'
import { getNavItem } from '@/lib/navigation'
import { seo } from '@/lib/seo'

const item = getNavItem('/toys')

export const Route = createFileRoute('/toys')({
  staticData: { breadcrumb: item.title },
  head: () => ({
    meta: seo({ title: item.title, description: item.description }),
  }),
  component: () => <SectionPage item={item} />,
})
