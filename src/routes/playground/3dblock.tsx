import { createFileRoute } from '@tanstack/react-router'

import { ToolPage, toolRouteOptions } from '@/components/playground/tool-page'
import { Block3D } from '@/components/playground/tools/block-3d'

export const Route = createFileRoute('/playground/3dblock')({
  ...toolRouteOptions('3dblock'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="3dblock" clientOnly wide>
      <Block3D />
    </ToolPage>
  )
}
