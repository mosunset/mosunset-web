import { createFileRoute } from '@tanstack/react-router'

import {
  clientOnlyTool,
  ToolPage,
  toolRouteOptions,
} from '@/components/playground/tool-page'
import { BoxPackingSpec } from '@/components/playground/tools/box-packing/spec'

// ツール本体（three.js と計算用の Worker）はブラウザでだけ読み込む。仕様の文章はサーバーでも描画する
const BoxPacking = clientOnlyTool(
  import.meta.env.SSR
    ? null
    : () =>
        import('@/components/playground/tools/box-packing/box-packing').then(
          (m) => ({
            default: m.BoxPacking,
          }),
        ),
)

export const Route = createFileRoute('/playground/box-packing')({
  ...toolRouteOptions('box-packing'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="box-packing" clientOnly wide after={<BoxPackingSpec />}>
      <BoxPacking />
    </ToolPage>
  )
}
