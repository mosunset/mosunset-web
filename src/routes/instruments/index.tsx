import { createFileRoute } from '@tanstack/react-router'

import { CollectionGrid } from '@/components/collection-view'
import { SectionPage } from '@/components/section-page'
import { getNavItem } from '@/lib/navigation'
import { seo } from '@/lib/seo'
import { listPublishedItems } from '@/server/collections'

const item = getNavItem('/instruments')

export const Route = createFileRoute('/instruments/')({
  head: () => ({
    meta: seo({ title: item.title, description: item.description }),
  }),
  loader: () => listPublishedItems({ data: { kind: 'instrument' } }),
  component: Page,
})

function Page() {
  const items = Route.useLoaderData()
  return (
    <SectionPage item={item}>
      <CollectionGrid kind="instrument" items={items} />
    </SectionPage>
  )
}
