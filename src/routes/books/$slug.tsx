import { createFileRoute } from '@tanstack/react-router'

import { CollectionDetailPage } from '@/components/collection/collection-pages'
import { collectionDetailOptions } from '@/components/collection/collection-routes'
import { CollectionNotFound } from '@/components/collection/collection-view'

export const Route = createFileRoute('/books/$slug')({
  ...collectionDetailOptions('book'),
  component: () => <CollectionDetailPage kind="book" />,
  notFoundComponent: () => <CollectionNotFound kind="book" />,
})
