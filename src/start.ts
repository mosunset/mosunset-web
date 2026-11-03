import { clerkMiddleware } from '@clerk/tanstack-react-start/server'
import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

import { securityHeadersMiddleware } from '@/server/security-headers'

// start.ts を置くと既定の CSRF 対策が外れるので、server function 用に自分で入れる
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [
    securityHeadersMiddleware,
    csrfMiddleware,
    clerkMiddleware(),
  ],
}))
