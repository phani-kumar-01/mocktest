import { buildApp } from './app.js';
import { migrate } from './db/migrate.js';
import * as dotenv from 'dotenv';
dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  try {
    await migrate();
    const app = await buildApp();
    await app.listen({ port: PORT, host: HOST });
    console.log(`Server listening on http://${HOST}:${PORT}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

main();
