import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 開発中に依存を途中で見つけて最適化し直すと、React やミドルウェアの状態が二重になって壊れることがある。
// Clerk と Tiptap まわりは起動時に最適化しておく
const sharedDeps = [
  '@clerk/tanstack-react-start',
  '@clerk/localizations',
  '@clerk/ui/themes',
  '@tiptap/react',
  '@tiptap/starter-kit',
  '@tiptap/extensions',
  '@tiptap/extension-image',
  '@tiptap/suggestion',
  '@tiptap/react/menus',
  '@marsidev/react-turnstile',
  '@dnd-kit/core',
  '@dnd-kit/sortable',
  '@dnd-kit/utilities',
]

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  optimizeDeps: { include: sharedDeps },
  environments: {
    ssr: {
      optimizeDeps: {
        include: [
          ...sharedDeps,
          '@clerk/tanstack-react-start/server',
          '@tiptap/static-renderer',
        ],
      },
    },
  },
  plugins: [
    devtools(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart({
      // src/server はサーバーだけの中身（DB・R2・秘密の値など）。ブラウザ用のバンドルから import されたらビルドを失敗させる。
      // files を指定すると既定の一覧が置き換わるので、既定の '**/*.server.*' も自分で書く
      importProtection: {
        client: { files: ['**/*.server.*', '**/src/server/**'] },
      },
    }),
    viteReact(),
  ],
})

export default config
