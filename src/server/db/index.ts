import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'

import * as schema from './schema'

/** D1 の Drizzle クライアント。サーバー側（server function / server route）からだけ使う */
export function getDb() {
  return drizzle(env.DB, { schema })
}

export { schema }
