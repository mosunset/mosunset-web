import { createFileRoute } from '@tanstack/react-router'

import { ToolPage, toolRouteOptions } from '@/components/playground/tool-page'
import { AutophagyClock } from '@/components/playground/tools/autophagy-clock'

export const Route = createFileRoute('/playground/autophagy-clock')({
  ...toolRouteOptions('autophagy-clock'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="autophagy-clock" clientOnly>
      <AutophagyClock />
    </ToolPage>
  )
}
