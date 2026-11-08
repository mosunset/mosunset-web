import { createFileRoute } from '@tanstack/react-router'

import { ContactForm } from '@/components/contact-form'
import { SocialIcon } from '@/components/layout/social-icons'
import { SectionPage } from '@/components/section-page'
import { getContactConfig } from '@/functions/contact'
import { getNavItem } from '@/lib/navigation'
import { sectionHead } from '@/lib/seo'
import { site } from '@/lib/site'

const item = getNavItem('/contact')

export const Route = createFileRoute('/contact')({
  staticData: { breadcrumb: item.title },
  head: () => sectionHead(item),
  loader: () => getContactConfig(),
  component: Contact,
})

function Contact() {
  const { turnstileSiteKey } = Route.useLoaderData()

  return (
    <SectionPage item={item}>
      <ContactForm turnstileSiteKey={turnstileSiteKey} />
      <div className="mt-12 border-t pt-6 text-sm text-muted-foreground">
        <p>SNS でも連絡を受け付けています。</p>
        <div className="mt-3 flex gap-4">
          {site.social.map((s) => (
            <a
              key={s.name}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer me"
              className="inline-flex items-center gap-2 hover:text-foreground"
            >
              <SocialIcon name={s.name} className="size-4" />
              {s.name}
            </a>
          ))}
        </div>
      </div>
    </SectionPage>
  )
}
