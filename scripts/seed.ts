import bcrypt from 'bcryptjs';
import { db, schema } from '../apps/api/src/db/client.js';
import { migrate } from '../apps/api/src/db/migrate.js';
import { eq } from 'drizzle-orm';

async function seed() {
  console.log('Seeding initial data...');
  await migrate();

  const adminUsername = 'admin';
  const existing = await db.select().from(schema.admins).where(eq(schema.admins.username, adminUsername)).limit(1);

  if (existing.length === 0) {
    const passwordHash = bcrypt.hashSync('admin123', 8);
    await db.insert(schema.admins).values({
      username: adminUsername,
      name: 'System Administrator',
      passwordHash
    });
    console.log('------------------------------------------------------------');
    console.log('DEFAULT ADMIN CREATED:');
    console.log('Username: admin');
    console.log('Password: admin123');
    console.log('WARNING: CHANGE THIS DEFAULT PASSWORD IMMEDIATELY BEFORE REAL USE');
    console.log('------------------------------------------------------------');
  } else {
    console.log('Admin account already exists.');
  }

  console.log('Seed completed successfully.');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
