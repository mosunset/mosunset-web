import { createFileRoute } from '@tanstack/react-router'

import {
  clientOnlyTool,
  ToolPage,
  toolRouteOptions,
} from '@/components/playground/tool-page'

// ツール本体はブラウザでだけ読み込む（サーバー用のビルドには入れない）
const MasonryImage = clientOnlyTool(
  import.meta.env.SSR
    ? null
    : () =>
        import('@/components/playground/tools/masonry-image').then((m) => ({
          default: m.MasonryImage,
        })),
)

export const Route = createFileRoute('/playground/masonryimage')({
  ...toolRouteOptions('masonryimage'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="masonryimage" clientOnly wide>
      <MasonryImage />
    </ToolPage>
  )
}
