import { createFileRoute } from '@tanstack/react-router'

import {
  clientOnlyTool,
  ToolPage,
  toolRouteOptions,
} from '@/components/playground/tool-page'

// ツール本体はブラウザでだけ読み込む（サーバー用のビルドには入れない）
const WhisperTranscribe = clientOnlyTool(
  import.meta.env.SSR
    ? null
    : () =>
        import(
          '@/components/playground/tools/whisper-transcribe/whisper-transcribe'
        ).then((m) => ({
          default: m.WhisperTranscribe,
        })),
)

export const Route = createFileRoute('/playground/whisper-transcribe')({
  ...toolRouteOptions('whisper-transcribe'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="whisper-transcribe" clientOnly wide>
      <WhisperTranscribe />
    </ToolPage>
  )
}
