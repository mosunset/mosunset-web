import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useServerFn } from '@tanstack/react-start'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { submitContact } from '@/functions/contact'
import { errorMessage } from '@/lib/errors'

export function ContactForm({
  turnstileSiteKey,
}: {
  turnstileSiteKey: string
}) {
  const submit = useServerFn(submitContact)
  const turnstileRef = useRef<TurnstileInstance>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [website, setWebsite] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  if (sent) {
    return (
      <div className="rounded-lg border p-8 text-center">
        <CheckCircle2 className="mx-auto size-10 text-primary" />
        <p className="mt-4 text-lg font-medium">送信しました</p>
        <p className="mt-2 text-muted-foreground">
          お問い合わせありがとうございます。内容を確認して、必要に応じてご連絡します。
        </p>
      </div>
    )
  }

  const onSubmit = async () => {
    if (!token) {
      setError('ロボットでないことの確認が終わるまでお待ちください')
      return
    }
    setPending(true)
    setError(null)
    try {
      await submit({
        data: { name, email, subject, body, website, turnstileToken: token },
      })
      setSent(true)
    } catch (e) {
      setError(errorMessage(e, '送信できませんでした'))
      // トークンは 1 回しか使えないので取り直す
      turnstileRef.current?.reset()
      setToken(null)
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="max-w-2xl space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">お名前</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            maxLength={100}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">メールアドレス</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            maxLength={200}
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="subject">
          件名 <span className="text-muted-foreground">（任意）</span>
        </Label>
        <Input
          id="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="body">内容</Label>
        <Textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          maxLength={5000}
          required
        />
      </div>

      {/* bot よけ。人には見えないので空のまま送られる */}
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] size-px overflow-hidden"
      >
        <label>
          ウェブサイト
          <input
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>

      <Turnstile
        ref={turnstileRef}
        siteKey={turnstileSiteKey}
        options={{ language: 'ja', theme: 'auto' }}
        onSuccess={setToken}
        onExpire={() => setToken(null)}
        onError={() => setToken(null)}
      />

      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        送信する
      </Button>
    </form>
  )
}
