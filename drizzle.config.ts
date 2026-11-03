import { defineConfig } from 'drizzle-kit'

// マイグレーション SQL を drizzle/ に生成し、wrangler d1 migrations apply で適用する
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
})
