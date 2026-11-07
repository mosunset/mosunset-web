import { createFileRoute } from '@tanstack/react-router'

import { collectionDetailRoute } from '@/lib/collection-routes'

export const Route = createFileRoute('/certifications/$slug')(
  collectionDetailRoute('certification'),
)
