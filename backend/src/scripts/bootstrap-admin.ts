import bcrypt from 'bcryptjs';
import { prisma } from '../database/prisma';
import { config } from '../config';
import { ledgerService } from '../services/ledgerService';
import { UserRole } from '@prisma/client';

export async function bootstrapFirstAdmin(): Promise<void> {
  console.log('🛡️ Starting First-Admin Bootstrap process...');

  const email = config.bootstrap.adminEmail.toLowerCase().trim();
  const password = config.bootstrap.adminPassword;
  const fullName = config.bootstrap.adminFullName;

  const existingAdmin = await prisma.user.findFirst({
    where: {
      OR: [
        { email },
        { role: UserRole.ADMIN },
      ],
    },
  });

  if (existingAdmin) {
    console.log(`✓ Admin user already exists: ${existingAdmin.email} (Role: ${existingAdmin.role})`);
  } else {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const admin = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        role: UserRole.ADMIN,
      },
    });

    console.log(`✓ Created First Admin successfully:`);
    console.log(`  Email: ${admin.email}`);
    console.log(`  Role:  ${admin.role}`);
  }

  // Also ensure the System Reserve account exists
  await prisma.$transaction(async (tx) => {
    const reserve = await ledgerService.getSystemReserveAccount(tx);
    console.log(`✓ Verified Central System Reserve Vault Account: ${reserve.accountNumber}`);
  });

  console.log('✓ First-Admin bootstrap completed successfully.');
}

if (require.main === module) {
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
}
