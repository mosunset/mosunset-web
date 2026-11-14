import { createFileRoute } from '@tanstack/react-router'

import {
  clientOnlyTool,
  ToolPage,
  toolRouteOptions,
} from '@/components/playground/tool-page'
import { CronNotes } from '@/components/playground/tools/cron-expression/notes'

// 今の時刻から計算するので、ブラウザでだけ描画する（サーバーとの時刻のずれで表示が食い違わないように）
const CronExpression = clientOnlyTool(
  import.meta.env.SSR
    ? null
    : () =>
        import('@/components/playground/tools/cron-expression').then((m) => ({
          default: m.CronExpression,
        })),
)

export const Route = createFileRoute('/playground/cron-expression')({
  ...toolRouteOptions('cron-expression'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="cron-expression" clientOnly wide after={<CronNotes />}>
      <CronExpression />
    </ToolPage>
  )
}
