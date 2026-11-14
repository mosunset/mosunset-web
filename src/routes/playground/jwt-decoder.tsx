import { createFileRoute } from '@tanstack/react-router'

import { ToolPage, toolRouteOptions } from '@/components/playground/tool-page'
import { JwtDecoder } from '@/components/playground/tools/jwt-decoder'

export const Route = createFileRoute('/playground/jwt-decoder')({
  ...toolRouteOptions('jwt-decoder'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="jwt-decoder">
      <JwtDecoder />
    </ToolPage>
  )
}
