export interface JobDefinition {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
}

export const job: JobDefinition = {
  name: 'results-compute',
  intervalMs: 10000,
  run: async () => {
    // Stub results compute
  }
};

export default job;
