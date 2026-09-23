import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? 'postgres://briotap:briotap@127.0.0.1:55432/briotap'
});

export const prisma = new PrismaClient({ adapter });
