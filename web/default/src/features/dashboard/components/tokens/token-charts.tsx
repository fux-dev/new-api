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
import { useQuery } from '@tanstack/react-query'
import { VChart } from '@visactor/react-vchart'
import { KeyRound, Loader2, ChevronUp, ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTheme } from '@/context/theme-provider'
import { getTokenQuotaData } from '@/features/dashboard/api'
import {
  TIME_GRANULARITY_OPTIONS,
  TIME_RANGE_PRESETS,
} from '@/features/dashboard/constants'
import {
  getDefaultDays,
  saveGranularity,
  processTokenChartData,
  processTokenTableData,
  resolveTokenLabel,
  renderQuotaCompat,
} from '@/features/dashboard/lib'
import type {
  ProcessedTokenChartData,
  TokenTableRow,
  UserChartsFilters,
} from '@/features/dashboard/types'
import { getRollingDateRange, type TimeGranularity } from '@/lib/time'
import { VCHART_OPTION } from '@/lib/vchart'

let themeManagerPromise: Promise<
  (typeof import('@visactor/vchart'))['ThemeManager']
> | null = null

const TOKEN_CHARTS: {
  value: string
  labelKey: string
  specKey: keyof ProcessedTokenChartData
}[] = [
  {
    value: 'rank',
    labelKey: 'Token Consumption Ranking',
    specKey: 'spec_token_rank',
  },
  {
    value: 'trend',
    labelKey: 'Token Consumption Trend',
    specKey: 'spec_token_trend',
  },
]

const TOP_TOKEN_LIMIT_OPTIONS = [5, 10, 20, 50]
const TABLE_PAGE_SIZE = 20

type SortKey = 'token_name' | 'username' | 'count' | 'token_used' | 'quota'
type SortDir = 'asc' | 'desc'

interface TokenChartsProps {
  filters: UserChartsFilters
  onFiltersChange: (filters: UserChartsFilters) => void
}

export function TokenCharts(props: TokenChartsProps) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const [themeReady, setThemeReady] = useState(false)
  const themeManagerRef = useRef<
    (typeof import('@visactor/vchart'))['ThemeManager'] | null
  >(null)

  const timeGranularity = props.filters.timeGranularity
  const selectedRange = props.filters.selectedRange
  const topUserLimit = props.filters.topUserLimit
  const onFiltersChange = props.onFiltersChange

  const [sortKey, setSortKey] = useState<SortKey>('quota')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(0)

  const timeRange = useMemo(() => {
    const { start, end } = getRollingDateRange(selectedRange)
    return {
      start_timestamp: Math.floor(start.getTime() / 1000),
      end_timestamp: Math.floor(end.getTime() / 1000),
    }
  }, [selectedRange])

  const handleRangeChange = useCallback(
    (days: number) => {
      onFiltersChange({ ...props.filters, selectedRange: days })
    },
    [onFiltersChange, props.filters]
  )

  const handleGranularityChange = useCallback(
    (g: TimeGranularity) => {
      saveGranularity(g)
      onFiltersChange({
        ...props.filters,
        timeGranularity: g,
        selectedRange: getDefaultDays(g),
      })
    },
    [onFiltersChange, props.filters]
  )

  const handleTopLimitChange = useCallback(
    (limit: number) => {
      onFiltersChange({ ...props.filters, topUserLimit: limit })
    },
    [onFiltersChange, props.filters]
  )

  useEffect(() => {
    const updateTheme = async () => {
      setThemeReady(false)
      if (!themeManagerPromise) {
        themeManagerPromise = import('@visactor/vchart').then(
          (m) => m.ThemeManager
        )
      }
      const ThemeManager = await themeManagerPromise
      themeManagerRef.current = ThemeManager
      ThemeManager.setCurrentTheme(resolvedTheme === 'dark' ? 'dark' : 'light')
      setThemeReady(true)
    }
    updateTheme()
  }, [resolvedTheme])

  const { data: tokenData, isLoading } = useQuery({
    queryKey: ['dashboard', 'token-quota', timeRange],
    queryFn: () => getTokenQuotaData(timeRange),
    select: (res) => (res.success ? res.data : []),
    staleTime: 60_000,
  })

  const chartData = useMemo(
    () =>
      processTokenChartData(
        isLoading ? [] : (tokenData ?? []),
        timeGranularity,
        t,
        topUserLimit
      ),
    [tokenData, isLoading, timeGranularity, t, topUserLimit]
  )

  const sortedTableRows = useMemo(() => {
    const rows = processTokenTableData(isLoading ? [] : (tokenData ?? []))
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * dir
      }
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [tokenData, isLoading, sortKey, sortDir])

  const pageCount = Math.max(1, Math.ceil(sortedTableRows.length / TABLE_PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pagedRows = sortedTableRows.slice(
    safePage * TABLE_PAGE_SIZE,
    safePage * TABLE_PAGE_SIZE + TABLE_PAGE_SIZE
  )

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      setSortDir('desc')
      return key
    })
    setPage(0)
  }, [])

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return null
    return sortDir === 'asc' ? (
      <ChevronUp className='inline size-3' />
    ) : (
      <ChevronDown className='inline size-3' />
    )
  }

  const columns: { key: SortKey; labelKey: string; align: 'left' | 'right' }[] = [
    { key: 'token_name', labelKey: 'Token', align: 'left' },
    { key: 'username', labelKey: 'Owner', align: 'left' },
    { key: 'count', labelKey: 'Requests', align: 'right' },
    { key: 'token_used', labelKey: 'Tokens', align: 'right' },
    { key: 'quota', labelKey: 'Quota', align: 'right' },
  ]

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-1.5 overflow-x-auto pb-1 sm:gap-2'>
        <Tabs
          value={String(selectedRange)}
          onValueChange={(value) => handleRangeChange(Number(value))}
          className='shrink-0'
        >
          <TabsList>
            {TIME_RANGE_PRESETS.map((preset) => (
              <TabsTrigger
                key={preset.days}
                value={String(preset.days)}
                className='px-2.5 text-xs'
              >
                {t(preset.label)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Tabs
          value={timeGranularity}
          onValueChange={(value) =>
            handleGranularityChange(value as TimeGranularity)
          }
          className='shrink-0'
        >
          <TabsList>
            {TIME_GRANULARITY_OPTIONS.map((opt) => (
              <TabsTrigger
                key={opt.value}
                value={opt.value}
                className='px-2.5 text-xs'
              >
                {t(opt.label)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Tabs
          value={String(topUserLimit)}
          onValueChange={(value) => handleTopLimitChange(Number(value))}
          className='shrink-0'
        >
          <TabsList>
            <span className='text-muted-foreground px-2 text-xs font-medium whitespace-nowrap'>
              {t('Top Tokens')}
            </span>
            {TOP_TOKEN_LIMIT_OPTIONS.map((limit) => (
              <TabsTrigger
                key={limit}
                value={String(limit)}
                className='px-2.5 text-xs'
              >
                {t('Top {{count}}', { count: limit })}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {isLoading && (
          <Loader2 className='text-muted-foreground size-4 animate-spin' />
        )}
      </div>

      <div className='grid gap-3'>
        {TOKEN_CHARTS.map((chart) => {
          const spec = chartData[chart.specKey]
          return (
            <div
              key={chart.value}
              className='overflow-hidden rounded-lg border'
            >
              <div className='flex w-full items-center gap-2 border-b px-3 py-2 sm:px-5 sm:py-3'>
                <KeyRound className='text-muted-foreground/60 size-4' />
                <div className='text-sm font-semibold'>{t(chart.labelKey)}</div>
              </div>
              <div className='h-[300px] p-1.5 sm:h-96 sm:p-2'>
                {isLoading ? (
                  <Skeleton className='h-full w-full' />
                ) : (
                  themeReady &&
                  spec && (
                    <VChart
                      key={`token-${chart.value}-${topUserLimit}-${resolvedTheme}`}
                      spec={{
                        ...spec,
                        theme: resolvedTheme === 'dark' ? 'dark' : 'light',
                        background: 'transparent',
                      }}
                      option={VCHART_OPTION}
                    />
                  )
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className='overflow-hidden rounded-lg border'>
        <div className='flex w-full items-center gap-2 border-b px-3 py-2 sm:px-5 sm:py-3'>
          <KeyRound className='text-muted-foreground/60 size-4' />
          <div className='text-sm font-semibold'>{t('Token Details')}</div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={col.align === 'right' ? 'text-right' : 'text-left'}
                >
                  <button
                    type='button'
                    onClick={() => toggleSort(col.key)}
                    className='inline-flex items-center gap-1 hover:underline'
                  >
                    {t(col.labelKey)}
                    {renderSortIcon(col.key)}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className='text-muted-foreground py-6 text-center'>
                  {t('No data available')}
                </TableCell>
              </TableRow>
            )}
            {pagedRows.map((row: TokenTableRow) => (
              <TableRow key={`${row.token_id}`}>
                <TableCell>{resolveTokenLabel(row, t)}</TableCell>
                <TableCell>{row.username || '-'}</TableCell>
                <TableCell className='text-right'>
                  {row.count.toLocaleString()}
                </TableCell>
                <TableCell className='text-right'>
                  {row.token_used.toLocaleString()}
                </TableCell>
                <TableCell className='text-right'>
                  {renderQuotaCompat(row.quota, 2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {pageCount > 1 && (
          <div className='text-muted-foreground flex items-center justify-end gap-3 border-t px-3 py-2 text-xs sm:px-5'>
            <button
              type='button'
              className='hover:underline disabled:opacity-40'
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              {t('Previous')}
            </button>
            <span>
              {safePage + 1} / {pageCount}
            </span>
            <button
              type='button'
              className='hover:underline disabled:opacity-40'
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              {t('Next')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
