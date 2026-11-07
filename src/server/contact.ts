import { env } from 'cloudflare:workers'
import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { count, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'

import { adminMiddleware } from '@/server/auth'
import { getDb, schema } from '@/server/db'
import { notifyContactMessage } from '@/server/notify'
import { verifyTurnstile } from '@/server/turnstile'
import { idInput } from '@/server/validation'

const { contactMessages: messages } = schema

// ---------------------------------------------------------------------------
// 公開側
// ---------------------------------------------------------------------------

/** フォームの表示に必要な設定（Turnstile のサイトキーは公開してよい値） */
export const getContactConfig = createServerFn({ method: 'GET' }).handler(
  () => ({ turnstileSiteKey: env.TURNSTILE_SITE_KEY }),
)

/**
 * 1 行で入力する欄。名前と件名は通知メールの件名・返信先に使うので、
 * 改行などの制御文字を入れさせない（メールのヘッダーを書き換えられないように）
 */
const singleLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      // biome-ignore lint/suspicious/noControlCharactersInRegex: 制御文字をわざと弾くための正規表現
      (v) => !/[\u0000-\u001f\u007f]/.test(v),
      '改行や制御文字は使えません',
    )

export const contactInputSchema = z.object({
  name: singleLine(100).refine((v) => v.length > 0, 'お名前を入力してください'),
  email: z.email('メールアドレスの形式が正しくありません').max(200),
  subject: singleLine(200).default(''),
  body: z
    .string()
    .trim()
    .min(1, '本文を入力してください')
    .max(5000, '本文は 5000 文字までです'),
  turnstileToken: z.string().min(1, 'ロボットでないことの確認をしてください'),
  /** 人には見えない入力欄。値が入っていたら bot とみなす */
  website: z.string().default(''),
})

export type ContactInput = z.input<typeof contactInputSchema>

export const submitContact = createServerFn({ method: 'POST' })
  .validator((data: unknown) => contactInputSchema.parse(data))
  .handler(async ({ data }) => {
    // bot には成功したふりをして、何も保存しない
    if (data.website) return { ok: true }

    const ip = getRequestHeader('cf-connecting-ip') ?? undefined
    if (!(await verifyTurnstile(data.turnstileToken, ip))) {
      throw new Error(
        'ロボットでないことの確認に失敗しました。もう一度お試しください',
      )
    }

    const [saved] = await getDb()
      .insert(messages)
      .values({
        name: data.name,
        email: data.email,
        subject: data.subject,
        body: data.body,
      })
      .returning({ id: messages.id })

    // メールが送れなくても問い合わせは保存済みなので、利用者にはエラーにしない
    try {
      await notifyContactMessage({ ...data, id: saved.id })
    } catch (e) {
      console.error('お問い合わせの通知メールを送れませんでした', e)
    }

    return { ok: true }
  })

// ---------------------------------------------------------------------------
// 管理側（すべて adminMiddleware 付き）
// ---------------------------------------------------------------------------

export const listMessages = createServerFn({ method: 'GET' })
  .middleware([adminMiddleware])
  .handler(async () => {
    return getDb()
      .select({
        id: messages.id,
        name: messages.name,
        email: messages.email,
        subject: messages.subject,
        body: messages.body,
        readAt: messages.readAt,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .orderBy(desc(messages.createdAt))
  })

export const countUnreadMessages = createServerFn({ method: 'GET' })
  .middleware([adminMiddleware])
  .handler(async () => {
    const [row] = await getDb()
      .select({ value: count() })
      .from(messages)
      .where(isNull(messages.readAt))
    return row?.value ?? 0
  })

/** 1 件取得して既読にする */
export const getMessage = createServerFn({ method: 'GET' })
  .middleware([adminMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data }) => {
    const db = getDb()
    const message = await db.query.contactMessages.findFirst({
      where: eq(messages.id, data.id),
    })
    if (!message) throw notFound()
    if (!message.readAt) {
      await db
        .update(messages)
        .set({ readAt: new Date() })
        .where(eq(messages.id, data.id))
    }
    return message
  })

export const markMessageUnread = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data }) => {
    await getDb()
      .update(messages)
      .set({ readAt: null })
      .where(eq(messages.id, data.id))
    return { ok: true }
  })

export const deleteMessage = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data }) => {
    await getDb().delete(messages).where(eq(messages.id, data.id))
    return { ok: true }
  })
