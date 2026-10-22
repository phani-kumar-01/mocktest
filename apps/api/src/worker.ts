import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface JobModule {
  job?: {
    name: string;
    intervalMs: number;
    run: () => Promise<void>;
  };
  default?: {
    name: string;
    intervalMs: number;
    run: () => Promise<void>;
  };
}

async function startWorker() {
  console.log('Starting NPTEL Exam Portal Worker process...');
  const jobsDir = path.join(__dirname, 'jobs');
  
  if (!fs.existsSync(jobsDir)) {
    console.error('Jobs directory not found:', jobsDir);
    return;
  }

  const files = fs.readdirSync(jobsDir).filter(f => (f.endsWith('.ts') || f.endsWith('.js')) && !f.endsWith('.test.ts'));
  console.log(`Found ${files.length} jobs to schedule: ${files.join(', ')}`);

  for (const file of files) {
    const jobPath = path.join(jobsDir, file);
    try {
      const mod: JobModule = await import(jobPath);
      const jobDef = mod.job || mod.default;

      if (jobDef && typeof jobDef.run === 'function') {
        console.log(`Registering job [${jobDef.name}] with interval ${jobDef.intervalMs}ms`);
        
        let isRunning = false;
        const tick = async () => {
          if (isRunning) return;
          isRunning = true;
          try {
            await jobDef.run();
          } catch (err) {
            console.error(`Error executing job [${jobDef.name}]:`, err);
          } finally {
            isRunning = false;
          }
        };

        // Initial run after short stagger
        setTimeout(tick, 1000);
        setInterval(tick, jobDef.intervalMs);
      }
    } catch (err) {
      console.error(`Failed to load job file ${file}:`, err);
    }
  }

  console.log('Worker loop initialized.');
}

startWorker();
