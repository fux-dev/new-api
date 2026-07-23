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

/**
 * Inputs for deciding whether the homepage notice dialog should auto-popup.
 *
 * All fields are plain serializable values so the decision can be unit-tested
 * with `node:test` without any DOM or React dependency.
 */
export interface NoticeAutoOpenInput {
  /** Current trimmed notice content from `/api/notice`. Empty string when none. */
  notice: string
  /** Persisted last-read notice content (trimmed). */
  lastReadNotice: string
  /** Persisted "Close Today" marker, formatted as `Date.toDateString()`. */
  closedUntilDate: string | null
  /** Today's date, formatted as `Date.toDateString()`. Injected for testability. */
  today: string
}

/**
 * Decide whether the homepage notice dialog should auto-popup.
 *
 * The dialog pops only when ALL of the following hold:
 *   1. There is a non-empty notice.
 *   2. The user has not yet read this exact notice content (so dismissing the
 *      dialog once suppresses re-popups on subsequent homepage visits until the
 *      admin changes the content).
 *   3. The user has not chosen "Close Today" for the current date.
 *
 * Keeping this as a pure function lets the behavior be locked down by table
 * tests, since the surrounding React effect is hard to exercise without a DOM
 * test harness (the repo currently uses `node:test` for frontend logic only).
 */
export function shouldAutoOpenNotice(input: NoticeAutoOpenInput): boolean {
  const { notice, lastReadNotice, closedUntilDate, today } = input

  if (!notice) return false
  if (notice === lastReadNotice) return false
  if (closedUntilDate === today) return false

  return true
}
