export interface JobDefinition {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
}

export const job: JobDefinition = {
  name: 'mailqueue',
  intervalMs: 5000,
  run: async () => {
    // Stub mail queue
  }
};

export default job;
