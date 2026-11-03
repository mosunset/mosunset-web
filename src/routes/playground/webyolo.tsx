import { createFileRoute } from '@tanstack/react-router'

import { ToolPage, toolRouteOptions } from '@/components/playground/tool-page'
import { ObjectDetection } from '@/components/playground/tools/object-detection'

export const Route = createFileRoute('/playground/webyolo')({
  ...toolRouteOptions('webyolo'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="webyolo" clientOnly wide>
      <ObjectDetection />
    </ToolPage>
  )
}
