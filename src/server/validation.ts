import { z } from 'zod'

/** id だけを受け取る server function の入力 */
export const idInput = z.object({ id: z.string() })
