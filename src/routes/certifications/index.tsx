import { createFileRoute } from '@tanstack/react-router'

import { CollectionGrid } from '@/components/collection-view'
import { SectionPage } from '@/components/section-page'
import { getNavItem } from '@/lib/navigation'
import { sectionHead } from '@/lib/seo'
import { listPublishedItems } from '@/server/collections'

const item = getNavItem('/certifications')

export const Route = createFileRoute('/certifications/')({
  head: () => sectionHead(item),
  loader: () => listPublishedItems({ data: { kind: 'certification' } }),
  component: Page,
})

function Page() {
  const items = Route.useLoaderData()
  return (
    <SectionPage item={item}>
      <CollectionGrid kind="certification" items={items} />
    </SectionPage>
  )
}
