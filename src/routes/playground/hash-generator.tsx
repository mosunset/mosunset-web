import { createFileRoute } from '@tanstack/react-router'

import { ToolPage, toolRouteOptions } from '@/components/playground/tool-page'
import { HashGenerator } from '@/components/playground/tools/hash-generator'

export const Route = createFileRoute('/playground/hash-generator')({
  ...toolRouteOptions('hash-generator'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="hash-generator">
      <HashGenerator />
    </ToolPage>
  )
}
