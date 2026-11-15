import { createFileRoute } from '@tanstack/react-router'

import {
  clientOnlyTool,
  ToolPage,
  toolRouteOptions,
} from '@/components/playground/tool-page'

// ツール本体（canvas で画素を読み書きする）はブラウザでだけ読み込む
const PerspectiveCorrection = clientOnlyTool(
  import.meta.env.SSR
    ? null
    : () =>
        import(
          '@/components/playground/tools/perspective-correction/perspective-correction'
        ).then((m) => ({ default: m.PerspectiveCorrection })),
)

export const Route = createFileRoute('/playground/perspective-correction')({
  ...toolRouteOptions('perspective-correction'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="perspective-correction" clientOnly wide>
      <PerspectiveCorrection />
    </ToolPage>
  )
}
