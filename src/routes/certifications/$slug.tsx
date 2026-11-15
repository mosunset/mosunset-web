import { createFileRoute } from '@tanstack/react-router'

import { CollectionDetailPage } from '@/components/collection/collection-pages'
import { collectionDetailOptions } from '@/components/collection/collection-routes'
import { CollectionNotFound } from '@/components/collection/collection-view'

export const Route = createFileRoute('/certifications/$slug')({
  ...collectionDetailOptions('certification'),
  component: () => <CollectionDetailPage kind="certification" />,
  notFoundComponent: () => <CollectionNotFound kind="certification" />,
})
