import { createFileRoute } from '@tanstack/react-router'

import { ToolPage, toolRouteOptions } from '@/components/playground/tool-page'
import { NgramSimilarity } from '@/components/playground/tools/ngram-similarity'

export const Route = createFileRoute('/playground/ngram-similarity')({
  ...toolRouteOptions('ngram-similarity'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="ngram-similarity">
      <NgramSimilarity />
    </ToolPage>
  )
}
