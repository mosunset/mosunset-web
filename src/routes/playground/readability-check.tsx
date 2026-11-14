import { createFileRoute } from '@tanstack/react-router'

import {
  clientOnlyTool,
  ToolPage,
  toolRouteOptions,
} from '@/components/playground/tool-page'

// ツール本体（kuromoji の辞書を読み込む）はブラウザでだけ読み込む
const ReadabilityCheck = clientOnlyTool(
  import.meta.env.SSR
    ? null
    : () =>
        import(
          '@/components/playground/tools/readability-check/readability-check'
        ).then((m) => ({
          default: m.ReadabilityCheck,
        })),
)

export const Route = createFileRoute('/playground/readability-check')({
  ...toolRouteOptions('readability-check'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="readability-check" clientOnly>
      <ReadabilityCheck />
    </ToolPage>
  )
}
