// src/ical.js
// Generates iCal (.ics) content for reminders.
// Users tap the link → event opens in Google Calendar / Apple Calendar / Outlook.

function generateIcsContent(title, fireAt) {
  const start = formatIcsDate(new Date(fireAt));
  const end = formatIcsDate(new Date(new Date(fireAt).getTime() + 30 * 60 * 1000)); // +30 min
  const now = formatIcsDate(new Date());

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Orga Bot//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `DTSTAMP:${now}`,
    `SUMMARY:${escapeIcs(title)}`,
    `DESCRIPTION:Created by Orga`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT10M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcs(title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function getIcalUrl(reminderId) {
  const base = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  return `${base}/ical/${reminderId}.ics`;
}

function getGoogleCalUrl(title, fireAt) {
  const start = formatGoogleDate(new Date(fireAt));
  const end = formatGoogleDate(new Date(new Date(fireAt).getTime() + 30 * 60 * 1000));
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${start}/${end}`,
    details: 'Created by Orga',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Google Calendar format: 20260401T033000Z
function formatGoogleDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Format date as ICS UTC: 20260401T033000Z
function formatIcsDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Escape special chars in ICS text
function escapeIcs(text) {
  return text.replace(/[\\;,]/g, c => '\\' + c).replace(/\n/g, '\\n');
}

module.exports = { generateIcsContent, getIcalUrl, getGoogleCalUrl };
