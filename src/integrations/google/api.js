// @ts-check
// src/integrations/google/api.js
// Thin, typed wrappers over the two Google APIs Orga uses. Return small plain
// objects (not raw API payloads) so tools and prompts stay compact.
// Docs: docs/modules/integrations.md

const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** @param {import('./client').GoogleClient} client */
function createGoogleApi(client) {
  return {
    /**
     * Events on the primary calendar in [timeMin, timeMax), soonest first.
     * @param {string} userId @param {Date} timeMin @param {Date} timeMax
     */
    async listEvents(userId, timeMin, timeMax) {
      const data = await client.request(userId, {
        url: `${CAL}/events`,
        params: { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), singleEvents: true, orderBy: 'startTime', maxResults: 25 },
      });
      return (data.items ?? []).map((/** @type {any} */ e) => ({
        id: e.id,
        title: e.summary ?? '(no title)',
        start: e.start?.dateTime ?? e.start?.date,
        end: e.end?.dateTime ?? e.end?.date,
        allDay: Boolean(e.start?.date),
        attendees: (e.attendees ?? []).map((/** @type {any} */ a) => a.email).slice(0, 10),
        location: e.location ?? null,
      }));
    },

    /**
     * @param {string} userId
     * @param {{ title: string, start: string, end: string, attendees?: string[], description?: string }} event
     */
    async createEvent(userId, { title, start, end, attendees = [], description }) {
      const data = await client.request(userId, {
        method: 'POST',
        url: `${CAL}/events`,
        params: { sendUpdates: attendees.length ? 'all' : 'none' },
        data: {
          summary: title,
          description,
          start: { dateTime: start, timeZone: 'Asia/Kolkata' },
          end: { dateTime: end, timeZone: 'Asia/Kolkata' },
          attendees: attendees.map((email) => ({ email })),
        },
      });
      return { id: data.id, link: data.htmlLink };
    },

    /**
     * Search Gmail and return headers + snippets (no bodies: least data needed).
     * @param {string} userId @param {string} query Gmail search syntax @param {number} max
     */
    async searchEmail(userId, query, max) {
      const list = await client.request(userId, { url: `${GMAIL}/messages`, params: { q: query, maxResults: max } });
      const ids = (list.messages ?? []).map((/** @type {any} */ m) => m.id);
      const messages = await Promise.all(ids.map((/** @type {string} */ id) => client.request(userId, {
        url: `${GMAIL}/messages/${id}`,
        params: { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] },
      })));
      return messages.map((m) => {
        const header = (/** @type {string} */ name) => m.payload?.headers?.find((/** @type {any} */ h) => h.name === name)?.value ?? '';
        return { id: m.id, from: header('From'), subject: header('Subject'), date: header('Date'), snippet: m.snippet ?? '' };
      });
    },
  };
}

/** @typedef {ReturnType<typeof createGoogleApi>} GoogleApi */

module.exports = { createGoogleApi };
