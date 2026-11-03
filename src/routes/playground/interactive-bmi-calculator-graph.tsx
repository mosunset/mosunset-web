import { createFileRoute } from '@tanstack/react-router'

import { ToolPage, toolRouteOptions } from '@/components/playground/tool-page'
import { BmiGraph } from '@/components/playground/tools/bmi-graph'

export const Route = createFileRoute(
  '/playground/interactive-bmi-calculator-graph',
)({
  ...toolRouteOptions('interactive-bmi-calculator-graph'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="interactive-bmi-calculator-graph">
      <BmiGraph />
    </ToolPage>
  )
}
