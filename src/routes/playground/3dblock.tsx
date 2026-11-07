import { createFileRoute } from '@tanstack/react-router'

import {
  clientOnlyTool,
  ToolPage,
  toolRouteOptions,
} from '@/components/playground/tool-page'

// ツール本体はブラウザでだけ読み込む（サーバー用のビルドには入れない）
const Block3D = clientOnlyTool(
  import.meta.env.SSR
    ? null
    : () =>
        import('@/components/playground/tools/block-3d').then((m) => ({
          default: m.Block3D,
        })),
)

export const Route = createFileRoute('/playground/3dblock')({
  ...toolRouteOptions('3dblock'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="3dblock" clientOnly wide>
      <Block3D />
    </ToolPage>
  )
}
