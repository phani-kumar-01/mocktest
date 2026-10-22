import path from 'path';
import postgres from 'postgres';
import { drizzle as drizzlePostgres, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import * as schema from './schema.js';
import * as dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const pooledUrl = process.env.DATABASE_URL;
const unpooledUrl = process.env.DATABASE_URL_UNPOOLED;
const connectionString = pooledUrl || unpooledUrl || 'postgres://exam:exam@localhost:5432/exam';
const directConnectionString = unpooledUrl || pooledUrl || connectionString;

const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
const usePglite = (process.env.USE_PGLITE === 'true' && !pooledUrl) || connectionString.startsWith('pglite://') || connectionString === 'memory://' || isTest;

type DbType = PostgresJsDatabase<typeof schema>;

let dbInstance: DbType;
let sqlInstance: any;
let directSqlInstance: any;

if (usePglite) {
  const defaultPglitePath = path.resolve(process.cwd(), '.pgdata');
  const pglitePath = isTest
    ? undefined
    : (connectionString.startsWith('pglite://') 
        ? connectionString.replace('pglite://', '') 
        : defaultPglitePath);
  const pglite = new PGlite(pglitePath);
  dbInstance = drizzlePglite(pglite, { schema }) as unknown as DbType;
  sqlInstance = pglite;
  directSqlInstance = pglite;
} else {
  // Runtime pooled connection (recommended by Neon best practices)
  const poolMax = parseInt(process.env.DB_POOL_MAX || '25', 10);
  sqlInstance = postgres(connectionString, { max: poolMax, idle_timeout: 20 });
  dbInstance = drizzlePostgres(sqlInstance, { schema });
  // Direct unpooled connection for migrations
  directSqlInstance = directConnectionString === connectionString 
    ? sqlInstance 
    : postgres(directConnectionString, { max: 2, idle_timeout: 10 });
}

export const db: DbType = dbInstance;
export const sql = sqlInstance;
export const directSql = directSqlInstance;
export { schema };
