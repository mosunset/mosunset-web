import { createFileRoute } from '@tanstack/react-router'

import { CollectionGrid } from '@/components/collection-view'
import { SectionPage } from '@/components/section-page'
import { getNavItem } from '@/lib/navigation'
import { sectionHead } from '@/lib/seo'
import { listPublishedItems } from '@/server/collections'

const item = getNavItem('/toys')

export const Route = createFileRoute('/toys/')({
  head: () => sectionHead(item),
  loader: () => listPublishedItems({ data: { kind: 'toy' } }),
  component: Page,
})

function Page() {
  const items = Route.useLoaderData()
  return (
    <SectionPage item={item}>
      <CollectionGrid kind="toy" items={items} />
    </SectionPage>
  )
}
