import { createFileRoute } from '@tanstack/react-router'

import { ToolPage, toolRouteOptions } from '@/components/playground/tool-page'
import { MonitorPairing } from '@/components/playground/tools/monitor-pairing'

export const Route = createFileRoute('/playground/monitor-pairing')({
  ...toolRouteOptions('monitor-pairing'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="monitor-pairing" wide>
      <MonitorPairing />
    </ToolPage>
  )
}
