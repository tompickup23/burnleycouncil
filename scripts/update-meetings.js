#!/usr/bin/env node
/* global process */
/**
 * Burnley Council Meetings Calendar Updater
 *
 * Scrapes the ModernGov portal for upcoming meetings and updates
 * public/data/meetings.json with current calendar data.
 *
 * Run weekly via cron or GitHub Actions:
 *   node scripts/update-meetings.js
 *
 * Schedule: Every Sunday at 03:00 UTC
 *   0 3 * * 0 cd /path/to/burnley-app && node scripts/update-meetings.js
 *
 * The script:
 *   1. Fetches the current month and next month calendars from ModernGov
 *   2. Fetches each meeting's page for agenda status and documents
 *   3. Preserves hand-written analysis (summary, public_relevance, doge_relevance)
 *   4. Adds new meetings with placeholder analysis
 *   5. Marks cancelled meetings
 *   6. Writes updated meetings.json
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MEETINGS_PATH = join(__dirname, '..', 'public', 'data', 'meetings.json')
const BASE_URL = 'https://burnley.moderngov.co.uk'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchHTML(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'BurnleyTransparencyBot/1.0 (public interest research)' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.text()
}

function extractMeetingsFromCalendar(html) {
  const meetings = []
  // ModernGov calendar uses table rows with links to meeting pages
  // Pattern: <a href="/ieListDocuments.aspx?CId=XXX&MId=XXXX">Committee Name</a>
  const meetingRegex = /href="(\/ieListDocuments\.aspx\?CId=(\d+)&MId=(\d+))"[^>]*>([^<]+)<\/a>/g
  // Date pattern in calendar cells: typically in dd/MM/yyyy or the cell structure
  // rowRegex kept for reference: /<tr[^>]*class="[^"]*mgCalendarRow[^"]*"[^>]*>([\s\S]*?)<\/tr>/g

  // Simpler approach: extract all meeting links with their text
  let match
  while ((match = meetingRegex.exec(html)) !== null) {
    const [, path, cId, mId, name] = match
    meetings.push({
      path: path.trim(),
      cId: parseInt(cId),
      mId: parseInt(mId),
      committee: name.trim(),
      url: `${BASE_URL}${path.trim()}`,
    })
  }
  return meetings
}

function extractDateFromMeetingPage(html) {
  // Look for date patterns like "Wednesday, 18 February, 2026 6.30 pm"
  const dateMatch = html.match(/(\w+day),\s+(\d{1,2})\s+(\w+),?\s+(\d{4})\s+(\d{1,2})[.:]\s*(\d{2})\s*(am|pm)/i)
  if (!dateMatch) return null

  const [, , day, monthName, year, hour, minute, ampm] = dateMatch
  const months = { January: 0, February: 1, March: 2, April: 3, May: 4, June: 5, July: 6, August: 7, September: 8, October: 9, November: 10, December: 11 }
  const month = months[monthName]
  if (month === undefined) return null

  let h = parseInt(hour)
  if (ampm.toLowerCase() === 'pm' && h < 12) h += 12
  if (ampm.toLowerCase() === 'am' && h === 12) h = 0

  const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(parseInt(day)).padStart(2, '0')}`
  const time = `${String(h).padStart(2, '0')}:${minute}`
  return { date, time }
}

function extractAgendaItems(html) {
  const items = []
  // Look for agenda item titles in the documents page
  const itemRegex = /<td[^>]*class="[^"]*mgMainTable[^"]*"[^>]*>[\s]*<a[^>]*>([^<]+)<\/a>/g
  let match
  while ((match = itemRegex.exec(html)) !== null) {
    const text = match[1].trim()
    if (text && text.length > 5 && !text.includes('PDF') && !text.includes('KB')) {
      items.push(text)
    }
  }
  return items
}

function isCancelled(html) {
  return /cancelled/i.test(html) && /this meeting/i.test(html)
}

function hasPublishedAgenda(html) {
  return /agenda/i.test(html) && (/published/i.test(html) || html.includes('mgDocumentAttachment'))
}

function extractDocuments(html) {
  const docs = []
  const docRegex = /mgDocumentAttachment[^>]*>([^<]+)</g
  let match
  while ((match = docRegex.exec(html)) !== null) {
    docs.push(match[1].trim())
  }
  return docs
}

function meetingTypeFromCommittee(name) {
  const lower = name.toLowerCase()
  if (lower.includes('full council')) return 'full_council'
  if (lower.includes('executive')) return 'executive'
  if (lower.includes('scrutiny')) return 'scrutiny'
  if (lower.includes('development control') || lower.includes('planning')) return 'planning'
  if (lower.includes('licensing') || lower.includes('taxi')) return 'licensing'
  if (lower.includes('key decision') || lower.includes('notice of')) return 'notice'
  if (lower.includes('town board') || lower.includes('pride in place')) return 'partnership'
  return 'other'
}

function makeId(committee, date) {
  const slug = committee.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug}-${date}`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Updating Burnley Council meetings calendar...')

  // Load existing data to preserve hand-written analysis
  let existing = { meetings: [], how_to_attend: {} }
  try {
    existing = JSON.parse(readFileSync(MEETINGS_PATH, 'utf-8'))
  } catch {
    console.log('No existing meetings.json found, creating new one.')
  }

  const existingMap = new Map(existing.meetings.map(m => [m.id, m]))

  // Fetch calendars for current month and next month
  const now = new Date()
  const months = [
    { m: now.getMonth() + 1, y: now.getFullYear() },
    { m: (now.getMonth() + 1) % 12 + 1, y: now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear() },
  ]

  const allRawMeetings = []

  for (const { m, y } of months) {
    const calUrl = `${BASE_URL}/mgCalendarMonthView.aspx?M=${m}&DD=${y}&CID=0&C=-1&MR=1&WE=1`
    console.log(`Fetching calendar: ${calUrl}`)
    try {
      const html = await fetchHTML(calUrl)
      const found = extractMeetingsFromCalendar(html)
      allRawMeetings.push(...found)
      console.log(`  Found ${found.length} meeting links`)
    } catch (err) {
      console.error(`  Error fetching calendar: ${err.message}`)
    }
  }

  // Deduplicate by mId
  const uniqueMeetings = new Map()
  for (const m of allRawMeetings) {
    uniqueMeetings.set(m.mId, m)
  }

  console.log(`\nProcessing ${uniqueMeetings.size} unique meetings...`)

  const updatedMeetings = []

  for (const raw of uniqueMeetings.values()) {
    console.log(`  Fetching: ${raw.committee}`)
    try {
      const html = await fetchHTML(raw.url)
      const dateInfo = extractDateFromMeetingPage(html)

      if (!dateInfo) {
        console.log(`    Skipping — could not parse date`)
        continue
      }

      // Only include meetings within our window (today to ~5 weeks ahead)
      const meetingDate = new Date(dateInfo.date + 'T00:00:00')
      const cutoff = new Date(now)
      cutoff.setDate(cutoff.getDate() + 37) // ~5 weeks + buffer
      const pastCutoff = new Date(now)
      pastCutoff.setDate(pastCutoff.getDate() - 7) // keep 1 week of past

      if (meetingDate > cutoff || meetingDate < pastCutoff) {
        console.log(`    Skipping — outside date window`)
        continue
      }

      const id = makeId(raw.committee, dateInfo.date)
      const cancelled = isCancelled(html)
      const agendaPublished = hasPublishedAgenda(html)
      const agendaItems = extractAgendaItems(html)
      const documents = extractDocuments(html)
      const type = meetingTypeFromCommittee(raw.committee)

      // Preserve existing hand-written analysis
      const prev = existingMap.get(id)

      const meeting = {
        id,
        date: dateInfo.date,
        time: dateInfo.time,
        committee: raw.committee,
        type,
        venue: cancelled ? null : 'Burnley Town Hall',
        status: cancelled ? 'cancelled' : agendaPublished ? 'agenda_published' : 'upcoming',
        cancelled,
        link: raw.url,
        agenda_items: agendaItems.length > 0 ? agendaItems : (prev?.agenda_items || []),
        summary: prev?.summary || `Agenda not yet published. Check back closer to the meeting date for details.`,
        public_relevance: prev?.public_relevance || `Check the agenda when published for items of public interest.`,
        doge_relevance: prev?.doge_relevance || null,
        speak_deadline: prev?.speak_deadline || null,
        documents: documents.length > 0 ? documents : (prev?.documents || []),
      }

      updatedMeetings.push(meeting)
      console.log(`    ${cancelled ? 'CANCELLED' : agendaPublished ? 'Agenda published' : 'Upcoming'} — ${dateInfo.date}`)
    } catch (err) {
      console.error(`    Error: ${err.message}`)
    }

    // Rate limit: 500ms between requests
    await new Promise(r => setTimeout(r, 500))
  }

  // Sort by date
  updatedMeetings.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))

  // Build output
  const nextWeek = new Date(now)
  nextWeek.setDate(nextWeek.getDate() + 7)

  const output = {
    last_updated: now.toISOString(),
    next_update: nextWeek.toISOString(),
    source: BASE_URL,
    how_to_attend: existing.how_to_attend,
    meetings: updatedMeetings,
  }

  writeFileSync(MEETINGS_PATH, JSON.stringify(output, null, 2))
  console.log(`\nDone! Wrote ${updatedMeetings.length} meetings to meetings.json`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
