/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { RichContent } from '@/components/rich-content'
import { useNotifications } from '@/hooks/use-notifications'
import { useNotificationStore } from '@/stores/notification-store'
import { useTheme } from '@/context/theme-provider'
import { isLikelyHtml } from '@/lib/content-format'
import { useAuthStore } from '@/stores/auth-store'

import { CTA, Features, Hero, HowItWorks, Stats } from './components'
import { NoticeDialog } from './components/notice-dialog'
import { shouldAutoOpenNotice } from './lib/notice-auto-open'
import { useHomePageContent } from './hooks'

export function Home() {
  const { i18n, t } = useTranslation()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const { resolvedTheme } = useTheme()
  const { auth } = useAuthStore()
  const isAuthenticated = !!auth.user
  const { content, isLoaded, isUrl } = useHomePageContent()

  // Notice dialog state
  const { notice } = useNotifications()
  // Subscribe to raw state values so the effect dependency array stays
  // explicit and transparent; no eslint-disable needed.
  const closedUntilDate = useNotificationStore((s) => s.closedUntilDate)
  const lastReadNotice = useNotificationStore((s) => s.lastReadNotice)
  const setClosedUntilDate = useNotificationStore((s) => s.setClosedUntilDate)
  const markNoticeRead = useNotificationStore((s) => s.markNoticeRead)
  const [noticeDialogOpen, setNoticeDialogOpen] = useState(false)

  let page: ReactNode

  const shouldAutoOpen = shouldAutoOpenNotice({
    notice,
    lastReadNotice,
    closedUntilDate,
    today: new Date().toDateString(),
  })

  // Depend on the raw inputs (notice string + read state), not on the derived
  // boolean. When the homepage mounts, `notice` is empty (React Query still
  // loading) so shouldAutoOpen is false; once the query resolves the notice
  // string changes from '' to the real content and the effect actually fires.
  // Depending on the boolean alone would skip the effect when another re-render
  // happens between the query resolving and the effect committing, leaving the
  // dialog closed even though it should pop.
  useEffect(() => {
    if (shouldAutoOpen) {
      setNoticeDialogOpen(true)
    }
  }, [shouldAutoOpen, notice, lastReadNotice, closedUntilDate])

  const handleCloseToday = () => {
    // Mark as read when the user dismisses the dialog, so the header bell
    // keeps showing the unread dot until the content is actually seen.
    if (notice) {
      markNoticeRead(notice)
    }
    setClosedUntilDate(new Date().toDateString())
    setNoticeDialogOpen(false)
  }

  const handleClose = () => {
    if (notice) {
      markNoticeRead(notice)
    }
    setNoticeDialogOpen(false)
  }

  const syncIframePreferences = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { themeMode: resolvedTheme },
        '*'
      )
      iframeRef.current?.contentWindow?.postMessage(
        { lang: i18n.language },
        '*'
      )
    } catch {
      // Cross-origin frames may reject access while navigating.
    }
  }, [i18n.language, resolvedTheme])

  useEffect(() => {
    if (isUrl) {
      syncIframePreferences()
    }
  }, [isUrl, syncIframePreferences])

  if (!isLoaded) {
    page = (
      <PublicLayout showMainContainer={false}>
        <main className='flex min-h-screen items-center justify-center'>
          <div className='text-muted-foreground'>{t('Loading...')}</div>
        </main>
      </PublicLayout>
    )
  } else if (content) {
    if (isUrl) {
      page = (
        <PublicLayout showMainContainer={false}>
          {/*
            allow-top-navigation-by-user-activation: the custom home page URL is
            admin-configured (trusted); this lets its target="_top" nav/menu links
            navigate the top-level window on user click. The default sandbox blocks
            this on desktop, while some mobile browsers allow it via allow-popups,
            causing inconsistent behavior. This token only permits user-activated
            top-level navigation and does NOT grant same-origin access.
          */}
          <iframe
            ref={iframeRef}
            src={content}
            className='h-screen w-full border-none'
            title={t('Custom Home Page')}
            sandbox='allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts allow-top-navigation-by-user-activation'
            onLoad={syncIframePreferences}
          />
        </PublicLayout>
      )
    } else {
      const contentIsHtml = isLikelyHtml(content)

      if (contentIsHtml) {
        page = (
          <PublicLayout showMainContainer={false}>
            <RichContent
              mode='html'
              htmlVariant='isolated'
              content={content}
              className='custom-home-content'
            />
          </PublicLayout>
        )
      } else {
        page = (
          <PublicLayout>
            <div className='mx-auto max-w-6xl px-4 py-8'>
              <RichContent
                mode='markdown'
                content={content}
                className='custom-home-content'
              />
            </div>
          </PublicLayout>
        )
      }
    }
  } else {
    page = (
      <PublicLayout showMainContainer={false}>
        <Hero isAuthenticated={isAuthenticated} />
        <Stats />
        <Features />
        <HowItWorks />
        <CTA isAuthenticated={isAuthenticated} />
        <Footer />
      </PublicLayout>
    )
  }

  return (
    <>
      {page}
      <NoticeDialog
        open={noticeDialogOpen}
        onOpenChange={setNoticeDialogOpen}
        notice={notice}
        onCloseToday={handleCloseToday}
        onClose={handleClose}
      />
    </>
  )
}
