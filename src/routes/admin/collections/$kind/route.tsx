import { createFileRoute, notFound, Outlet } from '@tanstack/react-router'

import { collections, isCollectionKind } from '@/lib/collections'

export const Route = createFileRoute('/admin/collections/$kind')({
  params: {
    parse: ({ kind }) => {
      if (!isCollectionKind(kind)) throw notFound()
      return { kind }
    },
    stringify: ({ kind }) => ({ kind }),
  },
  staticData: {
    breadcrumb: (match) => {
      const kind = (match.params as { kind?: string }).kind
      return kind && isCollectionKind(kind)
        ? collections[kind].label
        : undefined
    },
  },
  component: Outlet,
})
