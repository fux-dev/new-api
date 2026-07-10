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
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { QuotaDataItem } from '../types'
import {
  processTokenChartData,
  processTokenTableData,
  processTokenModelChartData,
  processTokenModelTableData,
  resolveTokenLabel,
} from './charts'

// Minimal TFunction stub: returns the key, interpolating {{id}} when provided.
const t = ((key: string, opts?: { id?: number }) => {
  if (opts && typeof opts.id === 'number') {
    return key.replace('{{id}}', String(opts.id))
  }
  return key
}) as never

const rows: QuotaDataItem[] = [
  { token_id: 11, token_name: 'primary', username: 'alice', created_at: 1100, count: 2, quota: 100, token_used: 40 },
  { token_id: 11, token_name: 'primary', username: 'alice', created_at: 1200, count: 1, quota: 50, token_used: 20 },
  { token_id: 22, token_name: 'backup', username: 'bob', created_at: 1100, count: 3, quota: 200, token_used: 60 },
  { token_id: 33, token_name: '', username: 'carol', created_at: 1100, count: 1, quota: 30, token_used: 10 },
]

describe('resolveTokenLabel', () => {
  test('uses token_name when present', () => {
    assert.equal(resolveTokenLabel({ token_id: 11, token_name: 'primary' }, t), 'primary')
  })
  test('falls back to Deleted({{id}}) when name empty and id > 0', () => {
    assert.equal(resolveTokenLabel({ token_id: 33, token_name: '' }, t), 'Deleted (33)')
  })
  test('falls back to Unknown when name empty and id missing/0', () => {
    assert.equal(resolveTokenLabel({ token_name: '' }, t), 'Unknown')
    assert.equal(resolveTokenLabel({ token_id: 0, token_name: '' }, t), 'Unknown')
  })
})

describe('processTokenTableData', () => {
  test('aggregates by token across time and sorts by quota desc', () => {
    const table = processTokenTableData(rows)
    assert.equal(table.length, 3)
    assert.deepEqual(
      table.map((r) => r.token_id),
      [22, 11, 33]
    )
    const primary = table.find((r) => r.token_id === 11)
    if (!primary) {
      assert.fail('expected a row for token id 11')
      return
    }
    assert.equal(primary.username, 'alice')
    assert.equal(primary.count, 3)
    assert.equal(primary.quota, 150)
    assert.equal(primary.token_used, 60)
    assert.equal(primary.token_name, 'primary')
  })
})

describe('processTokenChartData', () => {
  test('rank values ordered by quota desc and limited', () => {
    const chart = processTokenChartData(rows, 'day', t, 2)
    const rankValues = chart.spec_token_rank.data[0].values as Array<{
      Token: string
      rawQuota: number
    }>
    assert.equal(rankValues.length, 2)
    assert.equal(rankValues[0].Token, 'backup')
    assert.ok(rankValues[0].rawQuota > rankValues[1].rawQuota)
  })
})

const modelRows: QuotaDataItem[] = [
  { token_id: 11, token_name: 'primary', username: 'alice', model_name: 'gpt-a', created_at: 1100, count: 2, quota: 100, token_used: 40 },
  { token_id: 11, token_name: 'primary', username: 'alice', model_name: 'gpt-a', created_at: 1200, count: 1, quota: 50, token_used: 20 },
  { token_id: 11, token_name: 'primary', username: 'alice', model_name: 'gpt-b', created_at: 1100, count: 1, quota: 30, token_used: 10 },
  { token_id: 22, token_name: 'backup', username: 'bob', model_name: 'gpt-b', created_at: 1100, count: 3, quota: 200, token_used: 60 },
]

describe('processTokenModelTableData', () => {
  test('aggregates by model_name across tokens and time, sorts by quota desc', () => {
    const table = processTokenModelTableData(modelRows)
    assert.equal(table.length, 2)
    assert.deepEqual(
      table.map((r) => r.model_name),
      ['gpt-b', 'gpt-a']
    )
    const gptA = table.find((r) => r.model_name === 'gpt-a')!
    assert.equal(gptA.count, 3)
    assert.equal(gptA.quota, 150)
    assert.equal(gptA.token_used, 60)
  })
})

describe('processTokenModelChartData', () => {
  test('pie values ordered by quota desc and limited, remainder in Other', () => {
    const chart = processTokenModelChartData(modelRows, 'day', t, 1)
    const pieValues = chart.spec_token_model_pie.data[0].values as Array<{
      Model: string
      rawQuota: number
    }>
    // limit=1 → top model "gpt-b" (quota 230) shown, "gpt-a" (quota 150) folded into "Other"
    assert.equal(pieValues.length, 2)
    assert.equal(pieValues[0].Model, 'gpt-b')
    const other = pieValues.find((v) => v.Model === 'Other')!
    assert.ok(other.rawQuota > 0)
  })
})
