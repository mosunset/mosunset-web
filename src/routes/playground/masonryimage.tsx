import { createFileRoute } from '@tanstack/react-router'

import { ToolPage, toolRouteOptions } from '@/components/playground/tool-page'
import { MasonryImage } from '@/components/playground/tools/masonry-image'

export const Route = createFileRoute('/playground/masonryimage')({
  ...toolRouteOptions('masonryimage'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="masonryimage" clientOnly wide>
      <MasonryImage />
    </ToolPage>
  )
}
