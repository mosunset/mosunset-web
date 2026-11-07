import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { adminMiddleware } from '@/functions/auth'
import { renderRichText, richTextDocSchema } from '@/server/rich-text'

/** 保存前の内容を公開ページと同じ HTML にする（記事・コレクションのプレビュー用） */
export const previewRichText = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator((data: unknown) =>
    z.object({ content: richTextDocSchema }).parse(data),
  )
  .handler(({ data }) => ({
    html: renderRichText(data.content),
  }))
