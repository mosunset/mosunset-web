import { createFileRoute } from '@tanstack/react-router'

import { CollectionDetailPage } from '@/components/collection/collection-pages'
import { collectionDetailOptions } from '@/components/collection/collection-routes'
import { CollectionNotFound } from '@/components/collection/collection-view'

export const Route = createFileRoute('/toys/$slug')({
  ...collectionDetailOptions('toy'),
  component: () => <CollectionDetailPage kind="toy" />,
  notFoundComponent: () => <CollectionNotFound kind="toy" />,
})
