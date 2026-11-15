import { createFileRoute } from '@tanstack/react-router'

import { CollectionIndexPage } from '@/components/collection/collection-pages'
import { collectionIndexOptions } from '@/components/collection/collection-routes'

export const Route = createFileRoute('/instruments/')({
  ...collectionIndexOptions('instrument'),
  component: () => <CollectionIndexPage kind="instrument" />,
})
