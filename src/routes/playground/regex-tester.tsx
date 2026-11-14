import { createFileRoute } from '@tanstack/react-router'

import {
  clientOnlyTool,
  ToolPage,
  toolRouteOptions,
} from '@/components/playground/tool-page'

// 正規表現は Web Worker で実行するので、ツール本体はブラウザでだけ読み込む
const RegexTester = clientOnlyTool(
  import.meta.env.SSR
    ? null
    : () =>
        import('@/components/playground/tools/regex-tester/regex-tester').then(
          (m) => ({
            default: m.RegexTester,
          }),
        ),
)

export const Route = createFileRoute('/playground/regex-tester')({
  ...toolRouteOptions('regex-tester'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="regex-tester" clientOnly>
      <RegexTester />
    </ToolPage>
  )
}
