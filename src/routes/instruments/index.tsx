import { createFileRoute } from '@tanstack/react-router'

import { collectionIndexRoute } from '@/lib/collection-routes'

export const Route = createFileRoute('/instruments/')(
  collectionIndexRoute('instrument'),
)
