import { createFileRoute } from '@tanstack/react-router'

import {
  clientOnlyTool,
  ToolPage,
  toolRouteOptions,
} from '@/components/playground/tool-page'

// ツール本体はブラウザでだけ読み込む（サーバー用のビルドには入れない）
const ObjectDetection = clientOnlyTool(
  import.meta.env.SSR
    ? null
    : () =>
        import('@/components/playground/tools/object-detection').then((m) => ({
          default: m.ObjectDetection,
        })),
)

export const Route = createFileRoute('/playground/webyolo')({
  ...toolRouteOptions('webyolo'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="webyolo" clientOnly wide>
      <ObjectDetection />
    </ToolPage>
  )
}
