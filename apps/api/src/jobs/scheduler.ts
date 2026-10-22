export interface JobDefinition {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
}

export const job: JobDefinition = {
  name: 'scheduler',
  intervalMs: 5000,
  run: async () => {
    // Stub scheduler
  }
};

export default job;
