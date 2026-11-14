import { createFileRoute } from '@tanstack/react-router'

import {
  clientOnlyTool,
  ToolPage,
  toolRouteOptions,
} from '@/components/playground/tool-page'

// ツール本体（kuromoji の辞書を使う）はブラウザでだけ読み込む
const NotationVariance = clientOnlyTool(
  import.meta.env.SSR
    ? null
    : () =>
        import(
          '@/components/playground/tools/notation-variance/notation-variance'
        ).then((m) => ({
          default: m.NotationVariance,
        })),
)

export const Route = createFileRoute('/playground/notation-variance')({
  ...toolRouteOptions('notation-variance'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="notation-variance" clientOnly wide>
      <NotationVariance />
    </ToolPage>
  )
}
