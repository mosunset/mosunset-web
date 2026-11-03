import { createFileRoute } from '@tanstack/react-router'

import { ToolPage, toolRouteOptions } from '@/components/playground/tool-page'
import { UnitPriceComparison } from '@/components/playground/tools/unit-price-comparison'

export const Route = createFileRoute('/playground/unit-price-comparison')({
  ...toolRouteOptions('unit-price-comparison'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="unit-price-comparison">
      <UnitPriceComparison />
    </ToolPage>
  )
}
