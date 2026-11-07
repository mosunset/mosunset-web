import { z } from 'zod'

import { optionalSlugPattern, slugErrorMessage, slugPattern } from '@/lib/slug'

/** id だけを受け取る server function の入力 */
export const idInput = z.object({ id: z.string() })

// slug の検証。zod を画面側に持ち込まないよう、src/lib/slug.ts ではなくここに置く

/** 必須の slug */
export const slugSchema = z
  .string()
  .trim()
  .min(1, 'URL を入力してください')
  .max(100)
  .regex(slugPattern, slugErrorMessage)

/** 空なら自動で作る slug */
export const optionalSlugSchema = z
  .string()
  .trim()
  .max(100)
  .regex(optionalSlugPattern, slugErrorMessage)
