import path from 'path';
import postgres from 'postgres';
import { drizzle as drizzlePostgres, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import * as schema from './schema.js';
import * as dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const connectionString = process.env.DATABASE_URL || 'postgres://exam:exam@localhost:5432/exam';
const usePglite = process.env.USE_PGLITE === 'true' || connectionString.startsWith('pglite://') || connectionString === 'memory://';

type DbType = PostgresJsDatabase<typeof schema>;

let dbInstance: DbType;
let sqlInstance: any;

if (usePglite) {
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  const defaultPglitePath = path.resolve(process.cwd(), '.pgdata');
  const pglitePath = isTest
    ? undefined
    : (connectionString.startsWith('pglite://') 
        ? connectionString.replace('pglite://', '') 
        : defaultPglitePath);
  const pglite = new PGlite(pglitePath);
  dbInstance = drizzlePglite(pglite, { schema }) as unknown as DbType;
  sqlInstance = pglite;
} else {
  sqlInstance = postgres(connectionString, { max: 10, idle_timeout: 20 });
  dbInstance = drizzlePostgres(sqlInstance, { schema });
}

export const db: DbType = dbInstance;
export const sql = sqlInstance;
export { schema };
