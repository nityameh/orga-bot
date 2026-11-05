// scripts/create-invite.js
// Create an invite link (ADR-018). Needs database access, so only the owner can
// run it: this is how the first users (and interviewers) get in.
//   npm run invite:create                              1 use, 7 days
//   npm run invite:create -- --uses 5 --days 2 --label "Interview: Acme"
//   npm run invite:create -- --revoke ORGA-K7PM-Q2XD
// Docs: docs/modules/invites.md

require('dotenv').config();
const prisma = require('../src/db');
const { createInviteService } = require('../src/invites/service');
const { getConfig } = require('../src/config');

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

(async () => {
  const invites = createInviteService({ prisma, dashboardUrl: getConfig().DASHBOARD_URL });

  if (flag('--revoke')) {
    console.log((await invites.revokeInvite(flag('--revoke'))) ? '✓ Invite revoked' : '✗ No active invite with that code');
    return;
  }

  const invite = await invites.createInvite({
    maxUses: Math.min(Math.max(Number(flag('--uses')) || 1, 1), 500),
    days: Math.min(Math.max(Number(flag('--days')) || 7, 1), 365),
    label: flag('--label'),
  });
  console.log(`\n✓ Invite created (${invite.maxUses} use${invite.maxUses > 1 ? 's' : ''}, expires ${invite.expiresAt.toISOString().slice(0, 10)})`);
  console.log(`  Link: ${invite.url}`);
  console.log(`  Code: ${invite.code}\n`);
})()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
