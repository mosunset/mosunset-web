import { createFileRoute, Link } from '@tanstack/react-router'

import { AdminPage } from '@/components/admin/admin-page'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { collectionList } from '@/lib/collections'
import { getNavItem } from '@/lib/navigation'

export const Route = createFileRoute('/admin/collections/')({
  component: AdminCollections,
})

function AdminCollections() {
  return (
    <AdminPage title="コレクション">
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {collectionList.map((c) => {
          const Icon = getNavItem(c.path).icon
          return (
            <Link
              key={c.kind}
              to="/admin/collections/$kind"
              params={{ kind: c.kind }}
              className="group"
            >
              <Card className="h-full transition-colors group-hover:bg-muted/50">
                <CardHeader>
                  <Icon className="mb-2 size-6 text-muted-foreground" />
                  <CardTitle>{c.label}</CardTitle>
                </CardHeader>
              </Card>
            </Link>
          )
        })}
      </div>
    </AdminPage>
  )
}
