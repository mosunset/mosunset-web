import { createFileRoute } from '@tanstack/react-router'

import { ToolPage, toolRouteOptions } from '@/components/playground/tool-page'
import { IdGenerators } from '@/components/playground/tools/id-generators'

export const Route = createFileRoute('/playground/id-generators')({
  ...toolRouteOptions('id-generators'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="id-generators" clientOnly>
      <IdGenerators />
    </ToolPage>
  )
}
