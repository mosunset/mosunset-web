import { createFileRoute } from '@tanstack/react-router'

import { AdminPage } from '@/components/admin/admin-page'
import { CollectionForm } from '@/components/admin/collection-form'
import { collections } from '@/lib/collections/config'

export const Route = createFileRoute('/admin/collections/$kind/new')({
  staticData: { breadcrumb: '追加' },
  // 本の一覧でバーコードを読んで「登録する」を押したときに、ISBN を渡す。
  // ルートの設定はどのページでも読まれるので、zod を使わずに読む（zod を入れると全ページの JS に載る）
  validateSearch: (search: Record<string, unknown>): { isbn?: string } => {
    // URL に数字だけで書いた ISBN は数として読まれるので、文字にそろえる
    const isbn =
      typeof search.isbn === 'number' ? String(search.isbn) : search.isbn
    // 合わない値も isbn: undefined として返す（返さないと、URL の値がそのまま残る）
    return {
      isbn: typeof isbn === 'string' && isbn.length <= 40 ? isbn : undefined,
    }
  },
  component: NewItem,
})

function NewItem() {
  const { kind } = Route.useParams()
  const { isbn } = Route.useSearch()
  return (
    <AdminPage title={<>{collections[kind].label}を追加</>} form>
      <CollectionForm
        key={`${kind}:${isbn ?? ''}`}
        kind={kind}
        initialIsbn={kind === 'book' ? isbn : undefined}
      />
    </AdminPage>
  )
}
