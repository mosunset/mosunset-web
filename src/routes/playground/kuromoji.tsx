import { createFileRoute } from '@tanstack/react-router'

import { ToolPage, toolRouteOptions } from '@/components/playground/tool-page'
import { Kuromoji } from '@/components/playground/tools/kuromoji'

export const Route = createFileRoute('/playground/kuromoji')({
  ...toolRouteOptions('kuromoji'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="kuromoji" clientOnly wide>
      <Kuromoji />
    </ToolPage>
  )
}
