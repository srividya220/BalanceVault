import { bootstrapFirstAdmin } from '../src/scripts/bootstrap-admin';
import { prisma } from '../src/database/prisma';

bootstrapFirstAdmin()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('✗ Bootstrap failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
