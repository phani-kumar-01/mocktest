/**
 * Mulberry32 32-bit PRNG generator
 */
export function createMulberry32(seed: number) {
  let s = Math.floor(seed) >>> 0;
  return function next(): number {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic hash of strings into a 32-bit integer
 */
export function hashStringToSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

/**
 * Fisher-Yates in-place shuffle using a provided PRNG
 */
export function shuffleArray<T>(array: T[], prng: () => number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

export interface QuestionOrderItem {
  qid: string;
  options: string[]; // e.g. ['c', 'a', 'd', 'b']
}

export interface QuestionPoolItem {
  id: string;
  groupId?: string | null;
}

export interface GenerateOrderOptions {
  examId: string;
  studentId: string;
  poolQuestionIds?: string[];
  poolQuestions?: (string | QuestionPoolItem)[];
  questionsPerStudent: number;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
}

/**
 * Generate deterministic question order and option order for a student's attempt.
 * Preserves group clusters: questions belonging to the same group stay together
 * even when the exam question order is shuffled.
 */
export function generateQuestionOrder(opts: GenerateOrderOptions): {
  seed: number;
  questionOrder: QuestionOrderItem[];
} {
  const seedStr = `${opts.examId}:${opts.studentId}`;
  const seed = hashStringToSeed(seedStr);
  const prng = createMulberry32(seed);

  // Normalize input into items with id and optional groupId
  let items: QuestionPoolItem[] = [];
  if (opts.poolQuestions && opts.poolQuestions.length > 0) {
    items = opts.poolQuestions.map(q => (typeof q === 'string' ? { id: q } : q));
  } else if (opts.poolQuestionIds) {
    items = opts.poolQuestionIds.map(id => ({ id }));
  }

  // Group items by groupId if present; standalone questions form individual clusters
  const clusterMap = new Map<string, QuestionPoolItem[]>();
  const clusterOrder: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const key =
      item.groupId && item.groupId.trim() !== ''
        ? `group:${item.groupId.trim()}`
        : `item:${item.id || i}`;

    if (!clusterMap.has(key)) {
      clusterMap.set(key, []);
      clusterOrder.push(key);
    }
    clusterMap.get(key)!.push(item);
  }

  let clusters = clusterOrder.map(k => clusterMap.get(k)!);

  // If shuffleQuestions is true, shuffle the clusters
  if (opts.shuffleQuestions !== false) {
    clusters = shuffleArray(clusters, prng);
  }

  // Flatten the clusters back: questions in each group stay consecutively grouped
  let flattened = clusters.flat();

  if (flattened.length > opts.questionsPerStudent) {
    flattened = flattened.slice(0, opts.questionsPerStudent);
  }

  const standardOptions = ['a', 'b', 'c', 'd'];
  const questionOrder: QuestionOrderItem[] = flattened.map(item => {
    let options = [...standardOptions];
    if (opts.shuffleOptions !== false) {
      options = shuffleArray(options, prng);
    }
    return { qid: item.id, options };
  });

  return { seed, questionOrder };
}
