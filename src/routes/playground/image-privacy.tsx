import { createFileRoute } from '@tanstack/react-router'

import {
  clientOnlyTool,
  ToolPage,
  toolRouteOptions,
} from '@/components/playground/tool-page'

// ツール本体はブラウザでだけ読み込む（サーバー用のビルドには入れない）
const ImagePrivacy = clientOnlyTool(
  import.meta.env.SSR
    ? null
    : () =>
        import(
          '@/components/playground/tools/image-privacy/image-privacy'
        ).then((m) => ({ default: m.ImagePrivacy })),
)

export const Route = createFileRoute('/playground/image-privacy')({
  ...toolRouteOptions('image-privacy'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="image-privacy" clientOnly wide>
      <ImagePrivacy />
    </ToolPage>
  )
}
