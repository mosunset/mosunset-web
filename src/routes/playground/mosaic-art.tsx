import { createFileRoute } from '@tanstack/react-router'

import {
  clientOnlyTool,
  ToolPage,
  toolRouteOptions,
} from '@/components/playground/tool-page'

// ツール本体はブラウザでだけ読み込む（canvas と Worker を使う）
const MosaicArt = clientOnlyTool(
  import.meta.env.SSR
    ? null
    : () =>
        import('@/components/playground/tools/mosaic-art/mosaic-art').then(
          (m) => ({ default: m.MosaicArt }),
        ),
)

export const Route = createFileRoute('/playground/mosaic-art')({
  ...toolRouteOptions('mosaic-art'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="mosaic-art" clientOnly wide>
      <MosaicArt />
    </ToolPage>
  )
}
