// サーバー側の処理からだけ使う

import { env } from 'cloudflare:workers'
import { clerkClient } from '@clerk/tanstack-react-start/server'

import { absoluteUrl } from '@/lib/seo'
import { site } from '@/lib/site'
import { getAdminUserIds } from '@/server/auth'

/** 管理者（ADMIN_USER_IDS の先頭）の Clerk のメインのメールアドレス */
async function getAdminEmail() {
  const adminId = getAdminUserIds()[0]
  if (!adminId) return null
  const user = await clerkClient().users.getUser(adminId)
  const primary = user.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId,
  )
  return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null
}

type ContactMessage = {
  id: string
  name: string
  email: string
  subject: string
  body: string
}

/** お問い合わせが届いたことを管理者にメールで知らせる */
export async function notifyContactMessage(message: ContactMessage) {
  const to = await getAdminEmail()
  if (!to) throw new Error('通知先の管理者メールアドレスが見つかりません')

  const title = message.subject || `${message.name} さんから`
  await env.EMAIL.send({
    from: { name: site.name, email: env.CONTACT_FROM },
    to,
    // 返信するとそのまま問い合わせた人に届く
    replyTo: { name: message.name, email: message.email },
    subject: `【${site.name}】お問い合わせ: ${title}`,
    text: [
      `${site.name} のお問い合わせフォームからメッセージが届きました。`,
      '',
      `名前: ${message.name}`,
      `メール: ${message.email}`,
      `件名: ${message.subject || '（なし）'}`,
      '',
      message.body,
      '',
      '---',
      `管理画面で見る: ${absoluteUrl(`/admin/messages/${message.id}`)}`,
    ].join('\n'),
  })
}
