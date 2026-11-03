import { createFileRoute } from '@tanstack/react-router'

import { ToolPage, toolRouteOptions } from '@/components/playground/tool-page'
import { CharacterCount } from '@/components/playground/tools/character-count'

export const Route = createFileRoute('/playground/character-count')({
  ...toolRouteOptions('character-count'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="character-count">
      <CharacterCount />
    </ToolPage>
  )
}
