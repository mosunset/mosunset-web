import { SignIn } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'

import { seo } from '@/lib/seo'

export const Route = createFileRoute('/sign-in/$')({
  staticData: { breadcrumb: 'ログイン' },
  head: () => ({ meta: seo({ title: 'ログイン', noindex: true }) }),
  component: SignInPage,
})

function SignInPage() {
  return (
    <div className="flex justify-center px-6 py-16">
      <SignIn routing="path" path="/sign-in" fallbackRedirectUrl="/admin" />
    </div>
  )
}
