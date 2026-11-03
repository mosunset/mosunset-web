import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 開発中に依存を途中で見つけて最適化し直すと、React やミドルウェアの状態が二重になって壊れることがある。
// Clerk まわりは起動時に最適化しておく
const clerkDeps = [
  '@clerk/tanstack-react-start',
  '@clerk/localizations',
  '@clerk/ui/themes',
]

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  optimizeDeps: { include: clerkDeps },
  environments: {
    ssr: {
      optimizeDeps: {
        include: [...clerkDeps, '@clerk/tanstack-react-start/server'],
      },
    },
  },
  plugins: [
    devtools(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
