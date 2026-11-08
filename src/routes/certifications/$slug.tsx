import { createFileRoute } from '@tanstack/react-router'

import { collectionDetailRoute } from '@/components/collection/collection-routes'

export const Route = createFileRoute('/certifications/$slug')(
  collectionDetailRoute('certification'),
)
