import { createFileRoute } from '@tanstack/react-router'

import { collectionIndexRoute } from '@/components/collection-routes'

export const Route = createFileRoute('/certifications/')(
  collectionIndexRoute('certification'),
)
