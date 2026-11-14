import { createFileRoute } from '@tanstack/react-router'

import { ToolPage, toolRouteOptions } from '@/components/playground/tool-page'
import { EncodeDecode } from '@/components/playground/tools/encode-decode/encode-decode'

export const Route = createFileRoute('/playground/encode-decode')({
  ...toolRouteOptions('encode-decode'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="encode-decode" wide>
      <EncodeDecode />
    </ToolPage>
  )
}
