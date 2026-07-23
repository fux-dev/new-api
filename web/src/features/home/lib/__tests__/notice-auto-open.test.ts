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

import { shouldAutoOpenNotice } from '../notice-auto-open'

const TODAY = 'Wed Jul 23 2026'
const YESTERDAY = 'Tue Jul 22 2026'
const NOTICE = 'System maintenance tonight'

describe('shouldAutoOpenNotice', () => {
  test('does not open when there is no notice', () => {
    assert.equal(
      shouldAutoOpenNotice({
        notice: '',
        lastReadNotice: '',
        closedUntilDate: null,
        today: TODAY,
      }),
      false
    )
  })

  test('opens on first sight of a new notice', () => {
    assert.equal(
      shouldAutoOpenNotice({
        notice: NOTICE,
        lastReadNotice: '',
        closedUntilDate: null,
        today: TODAY,
      }),
      true
    )
  })

  test('does not reopen after the user dismissed it (regression: close-then-revisit)', () => {
    assert.equal(
      shouldAutoOpenNotice({
        notice: NOTICE,
        lastReadNotice: NOTICE,
        closedUntilDate: null,
        today: TODAY,
      }),
      false
    )
  })

  test('does not open when the user chose Close Today for the current date', () => {
    assert.equal(
      shouldAutoOpenNotice({
        notice: NOTICE,
        lastReadNotice: '',
        closedUntilDate: TODAY,
        today: TODAY,
      }),
      false
    )
  })

  test('respects Close Today only for the same day (next day it can open again)', () => {
    assert.equal(
      shouldAutoOpenNotice({
        notice: NOTICE,
        lastReadNotice: '',
        closedUntilDate: YESTERDAY,
        today: TODAY,
      }),
      true
    )
  })

  test('reopens when the admin edits the notice content', () => {
    assert.equal(
      shouldAutoOpenNotice({
        notice: 'Updated maintenance window',
        lastReadNotice: NOTICE,
        closedUntilDate: null,
        today: TODAY,
      }),
      true
    )
  })
})
