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
import { PieChart, Loader2, ChevronUp, ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
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
import { getTokenModelQuotaData } from '@/features/dashboard/api'
import {
  TIME_GRANULARITY_OPTIONS,
  TIME_RANGE_PRESETS,
} from '@/features/dashboard/constants'
import {
  getDefaultDays,
  saveGranularity,
  processTokenModelChartData,
  processTokenModelTableData,
  renderQuotaCompat,
} from '@/features/dashboard/lib'
import type {
  ProcessedTokenModelChartData,
  TokenModelTableRow,
  UserChartsFilters,
} from '@/features/dashboard/types'
import { getRollingDateRange, type TimeGranularity } from '@/lib/time'
import { VCHART_OPTION } from '@/lib/vchart'

let themeManagerPromise: Promise<
  (typeof import('@visactor/vchart'))['ThemeManager']
> | null = null

const TOKEN_MODEL_CHARTS: {
  value: string
  labelKey: string
  specKey: keyof ProcessedTokenModelChartData
}[] = [
  {
    value: 'pie',
    labelKey: 'Model Distribution',
    specKey: 'spec_token_model_pie',
  },
  {
    value: 'trend',
    labelKey: 'Model Consumption Trend',
    specKey: 'spec_token_model_trend',
  },
]

const TOP_MODEL_LIMIT = 20
const TABLE_PAGE_SIZE = 20

export interface TokenOption {
  token_id: number
  token_name: string
  username: string
}

type SortKey = 'model_name' | 'count' | 'token_used' | 'quota'
type SortDir = 'asc' | 'desc'

interface TokenModelChartsProps {
  filters: UserChartsFilters
  onFiltersChange: (filters: UserChartsFilters) => void
  tokenOptions: TokenOption[]
}

export function TokenModelCharts(props: TokenModelChartsProps) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const [themeReady, setThemeReady] = useState(false)
  const themeManagerRef = useRef<
    (typeof import('@visactor/vchart'))['ThemeManager'] | null
  >(null)

  const timeGranularity = props.filters.timeGranularity
  const selectedRange = props.filters.selectedRange
  const onFiltersChange = props.onFiltersChange

  const [selectedTokenID, setSelectedTokenID] = useState<number | 'all'>('all')
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

  const queryParams = useMemo(
    () =>
      selectedTokenID === 'all'
        ? timeRange
        : { ...timeRange, token_id: selectedTokenID },
    [timeRange, selectedTokenID]
  )

  const { data: modelData, isLoading } = useQuery({
    queryKey: ['dashboard', 'token-model-quota', queryParams],
    queryFn: () => getTokenModelQuotaData(queryParams),
    select: (res) => (res.success ? res.data : []),
    staleTime: 60_000,
  })

  const chartData = useMemo(
    () =>
      processTokenModelChartData(
        isLoading ? [] : (modelData ?? []),
        timeGranularity,
        t,
        TOP_MODEL_LIMIT,
      ),
    [modelData, isLoading, timeGranularity, t]
  )

  const sortedTableRows = useMemo(() => {
    const rows = processTokenModelTableData(isLoading ? [] : (modelData ?? []))
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * dir
      }
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [modelData, isLoading, sortKey, sortDir])

  const pageCount = Math.max(
    1,
    Math.ceil(sortedTableRows.length / TABLE_PAGE_SIZE)
  )
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

  const columns: { key: SortKey; labelKey: string; align: 'left' | 'right' }[] =
    [
      { key: 'model_name', labelKey: 'Model', align: 'left' },
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

        <Combobox
          value={String(selectedTokenID)}
          onValueChange={(v) =>
            setSelectedTokenID(v === 'all' ? 'all' : Number(v))
          }
        >
          <ComboboxInput
            showClear={selectedTokenID !== 'all'}
            placeholder={t('Search tokens...')}
            className='w-44'
          />
          <ComboboxContent>
            <ComboboxList>
              <ComboboxItem value='all'>{t('All Tokens')}</ComboboxItem>
              {props.tokenOptions.map((opt) => {
                const label =
                  opt.token_name ||
                  (opt.token_id > 0
                    ? t('Deleted ({{id}})', { id: opt.token_id })
                    : t('Unknown'))
                return (
                  <ComboboxItem key={opt.token_id} value={String(opt.token_id)}>
                    {label}
                  </ComboboxItem>
                )
              })}
            </ComboboxList>
            {props.tokenOptions.length === 0 && (
              <ComboboxEmpty>{t('No data available')}</ComboboxEmpty>
            )}
          </ComboboxContent>
        </Combobox>

        {isLoading && (
          <Loader2 className='text-muted-foreground size-4 animate-spin' />
        )}
      </div>

      <div className='grid gap-3'>
        {TOKEN_MODEL_CHARTS.map((chart) => {
          const spec = chartData[chart.specKey]
          return (
            <div
              key={chart.value}
              className='overflow-hidden rounded-lg border'
            >
              <div className='flex w-full items-center gap-2 border-b px-3 py-2 sm:px-5 sm:py-3'>
                <PieChart className='text-muted-foreground/60 size-4' />
                <div className='text-sm font-semibold'>
                  {t(chart.labelKey)}
                </div>
              </div>
              <div className='h-[300px] p-1.5 sm:h-96 sm:p-2'>
                {isLoading ? (
                  <Skeleton className='h-full w-full' />
                ) : (
                  themeReady &&
                  spec && (
                    <VChart
                      key={`token-model-${chart.value}-${resolvedTheme}`}
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
          <PieChart className='text-muted-foreground/60 size-4' />
          <div className='text-sm font-semibold'>{t('Model Details')}</div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }
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
                <TableCell
                  colSpan={columns.length}
                  className='text-muted-foreground py-6 text-center'
                >
                  {t('No data available')}
                </TableCell>
              </TableRow>
            )}
            {pagedRows.map((row: TokenModelTableRow) => (
              <TableRow key={`${row.model_name}`}>
                <TableCell>{row.model_name}</TableCell>
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
