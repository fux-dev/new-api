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
import { Megaphone } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { RichContent } from '@/components/rich-content'

interface NoticeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  notice: string
  onCloseToday: () => void
  onClose: () => void
}

export function NoticeDialog(props: NoticeDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={
        <div className='flex items-center gap-2'>
          <Megaphone className='size-5' />
          <span>{t('System Notice')}</span>
        </div>
      }
      contentClassName='sm:max-w-2xl'
      contentHeight='auto'
      footer={
        <>
          <Button variant='outline' onClick={props.onCloseToday}>
            {t('Close Today')}
          </Button>
          <Button onClick={props.onClose}>{t('Close')}</Button>
        </>
      }
    >
      <RichContent breaks content={props.notice} />
    </Dialog>
  )
}
