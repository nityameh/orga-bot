// scripts/make-admin.js
// Grant (or revoke) the admin role, which allows /invite in chat. Needs DB access.
//   npm run admin:grant -- <userId | phone>
//   npm run admin:grant -- <userId | phone> --revoke
// Docs: docs/modules/invites.md

require('dotenv').config();
const prisma = require('../src/db');

(async () => {
  const who = process.argv[2];
  if (!who) {
    console.error('Usage: npm run admin:grant -- <userId | phone> [--revoke]');
    process.exitCode = 1;
    return;
  }
  const role = process.argv.includes('--revoke') ? 'user' : 'admin';
  const { count } = await prisma.user.updateMany({ where: { OR: [{ id: who }, { phone: who }] }, data: { role } });
  console.log(count ? `✓ ${who} is now ${role}` : `✗ No user with id or phone ${who}`);
})()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
