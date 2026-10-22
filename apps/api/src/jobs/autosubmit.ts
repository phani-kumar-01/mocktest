export interface JobDefinition {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
}

export const job: JobDefinition = {
  name: 'autosubmit',
  intervalMs: 5000,
  run: async () => {
    // Stub autosubmit
  }
};

export default job;
