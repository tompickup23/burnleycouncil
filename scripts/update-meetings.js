#!/usr/bin/env node
/* global process */
/**
 * Council Meetings Calendar Updater
 *
 * Scrapes ModernGov portals for upcoming meetings and writes meetings.json.
 *
 * Usage:
 *   node scripts/update-meetings.js                  # Update all councils with ModernGov
 *   node scripts/update-meetings.js --council burnley # Update single council
 *
 * Schedule: Weekly via cron or GitHub Actions
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'burnley-council', 'data')

// Council configuration
const COUNCILS = {
  burnley: {
    name: 'Burnley',
    platform: 'moderngov',
    moderngov_url: 'https://burnley.moderngov.co.uk',
    venue: 'Burnley Town Hall',
    contact: 'democracy@burnley.gov.uk',
  },
  hyndburn: {
    name: 'Hyndburn',
    platform: 'moderngov',
    moderngov_url: 'https://democracy.hyndburnbc.gov.uk',
    venue: 'Scaitcliffe House, Accrington',
    contact: 'democratic.services@hyndburnbc.gov.uk',
  },
  pendle: {
    name: 'Pendle',
    platform: 'jadu',
    jadu_url: 'https://www.pendle.gov.uk',
    venue: 'Nelson Town Hall',
    contact: 'democratic.services@pendle.gov.uk',
  },
  rossendale: {
    name: 'Rossendale',
    platform: 'jadu',
    jadu_url: 'https://www.rossendale.gov.uk',
    venue: 'Futures Park, Bacup',
    contact: 'democracy@rossendale.gov.uk',
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decodeHtmlEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchHTML(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'AIDogeTransparencyBot/1.0 (public interest research)' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.text()
}

function extractMeetingsFromCalendar(html, baseUrl) {
  const meetings = []
  // Decode HTML entities so &amp; becomes & for URL parsing
  const decoded = html.replace(/&amp;/g, '&')

  // Match ieListDocuments links — extract CId and MId from href, committee name from title attribute
  const meetingRegex = /title=['"]([^'"]*?)['"][^>]*href=['"](\/?ieListDocuments\.aspx\?CId=(\d+)&MId=(\d+))['"]|href=['"](\/?ieListDocuments\.aspx\?CId=(\d+)&MId=(\d+))['"][^>]*title=['"]([^'"]*?)['"]/g
  let match
  while ((match = meetingRegex.exec(decoded)) !== null) {
    // Handle both attribute orderings (title before href, or href before title)
    const title = (match[1] || match[8] || '').replace(/&#\d+;/g, ' ').trim()
    const path = (match[2] || match[5] || '').trim()
    const cId = parseInt(match[3] || match[6])
    const mId = parseInt(match[4] || match[7])

    // Extract committee name from title like "Meeting of Planning Committee, 11/02/2026 3.00 pm"
    let committee = title
    const nameMatch = title.match(/Meeting\s+of\s+(.+?)(?:,\s*\d|$)/i)
    if (nameMatch) committee = nameMatch[1].trim()

    if (committee && !isNaN(mId)) {
      meetings.push({
        path,
        cId,
        mId,
        committee,
        url: path.startsWith('/') ? `${baseUrl}${path}` : `${baseUrl}/${path}`,
      })
    }
  }
  return meetings
}

function extractDateFromMeetingPage(html) {
  // Match dates like "Wednesday, 11 February, 2026 3.00 pm" or "Wednesday, 11th February, 2026 3.00 pm"
  const dateMatch = html.match(/(\w+day),\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\w+),?\s+(\d{4})\s+(\d{1,2})[.:]\s*(\d{2})\s*(am|pm)/i)
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
  // ModernGov uses mgAiTitleTxt for agenda item titles (both linked and plain text)
  // Note: ModernGov HTML has space between class attr and >, e.g. class="mgAiTitleTxt" >
  const itemRegex = /class="mgAiTitleTxt"\s*>\s*(?:<a[^>]*class="mgAiTitleLnk"[^>]*>)?([^<]+)/g
  let match
  while ((match = itemRegex.exec(html)) !== null) {
    const text = decodeHtmlEntities(match[1])
    // Filter out item numbers (e.g. "1.", "3.a"), short text, PDF metadata
    if (text && text.length > 5 && !text.includes('PDF') && !text.includes('KB') && !/^\d+\.?[a-z]?$/.test(text)) {
      items.push(text)
    }
  }
  return items
}

function isCancelled(html) {
  return /cancelled/i.test(html) && /this meeting/i.test(html)
}

function hasPublishedAgenda(html) {
  return /agenda/i.test(html) && (
    /published/i.test(html) || html.includes('mgAiTitleLnk') || html.includes('mgItemTable')
  )
}

function extractDocuments(html) {
  const docs = []
  const docRegex = /mgAiTitleLnk[^>]*>\s*([^<]+)/g
  let match
  while ((match = docRegex.exec(html)) !== null) {
    const text = decodeHtmlEntities(match[1])
    if (text && text.length > 3) docs.push(text)
  }
  return docs
}

function meetingTypeFromCommittee(name) {
  const lower = name.toLowerCase()
  if (lower.includes('council') && !lower.includes('committee')) return 'full_council'
  if (lower.includes('cabinet') || lower.includes('executive')) return 'executive'
  if (lower.includes('scrutiny')) return 'scrutiny'
  if (lower.includes('development control') || lower.includes('planning')) return 'planning'
  if (lower.includes('licensing') || lower.includes('taxi') || lower.includes('hackney')) return 'licensing'
  if (lower.includes('key decision') || lower.includes('notice of')) return 'notice'
  if (lower.includes('town board') || lower.includes('pride in place')) return 'partnership'
  if (lower.includes('audit')) return 'audit'
  if (lower.includes('standards')) return 'standards'
  return 'other'
}

function makeId(committee, date) {
  const slug = committee.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug}-${date}`
}

// ---------------------------------------------------------------------------
// Scrape a single council
// ---------------------------------------------------------------------------

async function scrapeCouncil(councilId, config) {
  const baseUrl = config.moderngov_url
  const meetingsPath = join(DATA_DIR, councilId, 'meetings.json')

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Updating ${config.name} meetings from ${baseUrl}`)
  console.log('='.repeat(60))

  // Load existing data to preserve hand-written analysis
  let existing = { meetings: [], how_to_attend: {} }
  try {
    existing = JSON.parse(readFileSync(meetingsPath, 'utf-8'))
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
    const calUrl = `${baseUrl}/mgCalendarAgendaView.aspx?MR=1&M=${m}&DD=${y}&CID=0&OT=&C=-1&WE=1&D=1`
    console.log(`Fetching calendar: ${calUrl}`)
    try {
      const html = await fetchHTML(calUrl)
      const found = extractMeetingsFromCalendar(html, baseUrl)
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

      // Only include meetings within our window
      const meetingDate = new Date(dateInfo.date + 'T00:00:00')
      const cutoff = new Date(now)
      cutoff.setDate(cutoff.getDate() + 37)
      const pastCutoff = new Date(now)
      pastCutoff.setDate(pastCutoff.getDate() - 7)

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
        venue: cancelled ? null : config.venue,
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
    source: baseUrl,
    how_to_attend: existing.how_to_attend || {},
    meetings: updatedMeetings,
  }

  // Ensure directory exists
  const dir = dirname(meetingsPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  writeFileSync(meetingsPath, JSON.stringify(output, null, 2))
  console.log(`\nDone! Wrote ${updatedMeetings.length} meetings to ${meetingsPath}`)
  return updatedMeetings.length
}

// ---------------------------------------------------------------------------
// Jadu CMS Scraper (Pendle, Rossendale)
// ---------------------------------------------------------------------------

function extractJaduMeetings(html, baseUrl) {
  const meetings = []
  // Jadu lists meetings as: <a href="[base]/meetings/meeting/{ID}/{slug}">Committee Name</a> <small>Date</small>
  // or: <a href="[base]/meetings/meeting/{ID}/{slug}">Date: Committee Name</a>
  // URLs can be absolute (https://...) or relative (/meetings/...)
  const linkRegex = /<a\s+[^>]*href="([^"]*\/meetings\/meeting\/(\d+)\/[^"]+)"[^>]*>([^<]+)<\/a>\s*(?:<small>([^<]+)<\/small>)?/g
  let match
  while ((match = linkRegex.exec(html)) !== null) {
    const [, path, id, linkText, smallDate] = match
    let committee, dateStr

    if (smallDate) {
      // Format: <a>Committee</a> <small>Date</small>
      committee = linkText.trim()
      dateStr = smallDate.trim()
    } else if (linkText.includes(':')) {
      // Format: "11th February 2026: Committee Name" (Rossendale-style)
      const colonIdx = linkText.indexOf(':')
      dateStr = linkText.substring(0, colonIdx).trim()
      committee = linkText.substring(colonIdx + 1).trim()
    } else {
      continue
    }

    // Parse date like "Wednesday, 11th February 2026" or "11th February 2026"
    const dateMatch = dateStr.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/)
    if (!dateMatch) continue

    const [, day, monthName, year] = dateMatch
    const months = { January: 0, February: 1, March: 2, April: 3, May: 4, June: 5, July: 6, August: 7, September: 8, October: 9, November: 10, December: 11 }
    const month = months[monthName]
    if (month === undefined) continue

    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(parseInt(day)).padStart(2, '0')}`

    meetings.push({
      meetingId: parseInt(id),
      path,
      committee: committee.replace(/\s+/g, ' ').trim(),
      date,
      url: path.startsWith('http') ? path : `${baseUrl}${path}`,
    })
  }
  return meetings
}

function extractJaduDocuments(html) {
  const docs = []
  // Jadu download links may contain inner elements (e.g. Rossendale's <span class="icon">)
  // so we capture text before the first child tag, not all the way to </a>
  const docRegex = /<a\s+[^>]*href="([^"]*\/download\/meetings\/[^"]+)"[^>]*>\s*([^<]+)/g
  let match
  while ((match = docRegex.exec(html)) !== null) {
    const name = decodeHtmlEntities(match[2])
    if (name && name.length > 2) docs.push(name)
  }
  return docs
}

function extractJaduAgendaItems(html) {
  const items = []
  const seen = new Set()

  // Pendle format: "Item 3 - Title" or "Item 6(a) Title" in Reports-type download links
  // Rossendale format: "D1. Title" or "A2. Title" in Report-section download links
  const docRegex = /<a\s+[^>]*href="[^"]*\/download\/meetings\/[^"]*"[^>]*>\s*([^<]+)/g
  let match
  while ((match = docRegex.exec(html)) !== null) {
    const text = decodeHtmlEntities(match[1])

    // Pendle: "Item 3 - External Audit Report" or "Item 6(a) Planning applications"
    const pendleMatch = text.match(/^Item\s+(\d+[a-z]?(?:\([a-z]\))?)\s*[-–]?\s*(.+)$/i)
    if (pendleMatch) {
      const itemNum = pendleMatch[1].replace(/^0+/, '') // strip leading zeros
      const title = pendleMatch[2].trim()
      // Skip appendices and duplicates
      if (!seen.has(itemNum) && !/^appendix/i.test(title)) {
        seen.add(itemNum)
        items.push(title)
      }
      continue
    }

    // Rossendale: "D1. Better Lives Rossendale" or "B1. 2025/0288 Planning Application"
    const rossMatch = text.match(/^([A-Z]\d+[a-z]?[i]*)\.\s+(.+)$/i)
    if (rossMatch) {
      const itemNum = rossMatch[1].toUpperCase()
      const title = rossMatch[2].trim()
      // Skip minutes references (A2. Minutes of...) and appendices
      if (!seen.has(itemNum) && !/^minutes/i.test(title) && !/^appendix/i.test(title)) {
        seen.add(itemNum)
        items.push(title)
      }
      continue
    }
  }
  return items
}

async function scrapeJaduCouncil(councilId, config) {
  const baseUrl = config.jadu_url
  const meetingsPath = join(DATA_DIR, councilId, 'meetings.json')

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Updating ${config.name} meetings from ${baseUrl} (Jadu CMS)`)
  console.log('='.repeat(60))

  // Load existing data
  let existing = { meetings: [], how_to_attend: {} }
  try {
    existing = JSON.parse(readFileSync(meetingsPath, 'utf-8'))
  } catch {
    console.log('No existing meetings.json found, creating new one.')
  }
  const existingMap = new Map(existing.meetings.map(m => [m.id, m]))

  // Fetch main meetings page (upcoming)
  const meetingsUrl = `${baseUrl}/meetings`
  console.log(`Fetching: ${meetingsUrl}`)

  const allRawMeetings = []
  try {
    const html = await fetchHTML(meetingsUrl)
    const found = extractJaduMeetings(html, baseUrl)
    allRawMeetings.push(...found)
    console.log(`  Found ${found.length} meetings on page 1`)
  } catch (err) {
    console.error(`  Error: ${err.message}`)
  }

  // Try page 2 for more meetings
  await new Promise(r => setTimeout(r, 500))
  try {
    const html = await fetchHTML(`${meetingsUrl}?page=2`)
    const found = extractJaduMeetings(html, baseUrl)
    allRawMeetings.push(...found)
    if (found.length > 0) console.log(`  Found ${found.length} meetings on page 2`)
  } catch (err) {
    console.error(`  Error fetching page 2: ${err.message}`)
  }

  // Deduplicate by meetingId
  const uniqueMeetings = new Map()
  for (const m of allRawMeetings) {
    uniqueMeetings.set(m.meetingId, m)
  }

  // Filter to our date window
  const now = new Date()
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() + 37)
  const pastCutoff = new Date(now)
  pastCutoff.setDate(pastCutoff.getDate() - 7)

  console.log(`\nProcessing ${uniqueMeetings.size} unique meetings...`)
  const updatedMeetings = []

  for (const raw of uniqueMeetings.values()) {
    const meetingDate = new Date(raw.date + 'T00:00:00')
    if (meetingDate > cutoff || meetingDate < pastCutoff) {
      console.log(`  Skipping ${raw.committee} (${raw.date}) — outside date window`)
      continue
    }

    console.log(`  Fetching: ${raw.committee} (${raw.date})`)

    let documents = []
    let agendaItems = []
    try {
      const html = await fetchHTML(raw.url)
      documents = extractJaduDocuments(html)
      agendaItems = extractJaduAgendaItems(html)
    } catch (err) {
      console.error(`    Error fetching detail: ${err.message}`)
    }

    const id = makeId(raw.committee, raw.date)
    const type = meetingTypeFromCommittee(raw.committee)
    const prev = existingMap.get(id)
    // Detect published agenda: check for "agenda" in doc names, or if we have agenda items/report docs
    const hasAgenda = documents.length > 0 && (
      documents.some(d => /agenda/i.test(d)) || agendaItems.length > 0
    )

    const meeting = {
      id,
      date: raw.date,
      time: '18:30', // Jadu doesn't show times in HTML; default to common council time
      committee: raw.committee,
      type,
      venue: config.venue,
      status: hasAgenda ? 'agenda_published' : 'upcoming',
      cancelled: false,
      link: raw.url,
      agenda_items: agendaItems.length > 0 ? agendaItems : (prev?.agenda_items || []),
      summary: prev?.summary || `Check the council website for full agenda details.`,
      public_relevance: prev?.public_relevance || `Check the agenda when published for items of public interest.`,
      doge_relevance: prev?.doge_relevance || null,
      speak_deadline: prev?.speak_deadline || null,
      documents: documents.length > 0 ? documents : (prev?.documents || []),
    }

    updatedMeetings.push(meeting)
    console.log(`    ${hasAgenda ? 'Agenda published' : 'Upcoming'} — ${documents.length} docs, ${agendaItems.length} items`)

    await new Promise(r => setTimeout(r, 500))
  }

  // Sort by date
  updatedMeetings.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))

  const nextWeek = new Date(now)
  nextWeek.setDate(nextWeek.getDate() + 7)

  const output = {
    last_updated: now.toISOString(),
    next_update: nextWeek.toISOString(),
    source: `${baseUrl}/meetings`,
    how_to_attend: existing.how_to_attend || {},
    meetings: updatedMeetings,
  }

  const dir = dirname(meetingsPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  writeFileSync(meetingsPath, JSON.stringify(output, null, 2))
  console.log(`\nDone! Wrote ${updatedMeetings.length} meetings to ${meetingsPath}`)
  return updatedMeetings.length
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const councilFlag = args.indexOf('--council')
  const targetCouncil = councilFlag >= 0 ? args[councilFlag + 1] : null

  const councilsToProcess = targetCouncil
    ? { [targetCouncil]: COUNCILS[targetCouncil] }
    : COUNCILS

  if (targetCouncil && !COUNCILS[targetCouncil]) {
    console.error(`Unknown council: ${targetCouncil}. Available: ${Object.keys(COUNCILS).join(', ')}`)
    process.exit(1)
  }

  let totalMeetings = 0
  for (const [id, config] of Object.entries(councilsToProcess)) {
    if (config.platform === 'jadu') {
      totalMeetings += await scrapeJaduCouncil(id, config)
    } else {
      totalMeetings += await scrapeCouncil(id, config)
    }
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`All done! ${totalMeetings} meetings across ${Object.keys(councilsToProcess).length} council(s)`)
  console.log('='.repeat(60))
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
