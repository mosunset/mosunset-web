import { createFileRoute } from '@tanstack/react-router'

import { collectionIndexRoute } from '@/components/collection/collection-routes'

export const Route = createFileRoute('/toys/')(collectionIndexRoute('toy'))
