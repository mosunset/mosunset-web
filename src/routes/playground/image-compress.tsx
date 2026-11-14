import { createFileRoute } from '@tanstack/react-router'

import {
  clientOnlyTool,
  ToolPage,
  toolRouteOptions,
} from '@/components/playground/tool-page'

// ツール本体（canvas・Worker・exifr・fflate）はブラウザでだけ読み込む
const ImageCompress = clientOnlyTool(
  import.meta.env.SSR
    ? null
    : () =>
        import(
          '@/components/playground/tools/image-compress/image-compress'
        ).then((m) => ({
          default: m.ImageCompress,
        })),
)

export const Route = createFileRoute('/playground/image-compress')({
  ...toolRouteOptions('image-compress'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="image-compress" clientOnly>
      <ImageCompress />
    </ToolPage>
  )
}
