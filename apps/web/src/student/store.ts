import { create } from 'zustand';
import { api } from '../lib/api.js';
import { StudentQuestionItem } from '@nptel/shared';

export interface QueueItem {
  qid: string;
  chosen: string | null;
  ts: number;
}

interface StudentExamStore {
  attemptId: string | null;
  status: string;
  questions: StudentQuestionItem[];
  currentIndex: number;
  answers: Record<string, string | null>;
  marked: Set<string>;
  deadlineAt: Date | null;
  remainingSeconds: number;
  serverOffsetMs: number;
  saveStatus: 'saved' | 'saving' | 'offline';
  retryQueue: QueueItem[];

  initExam: (data: {
    attemptId: string;
    status: string;
    questions: StudentQuestionItem[];
    answers: Record<string, string | null>;
    deadlineAt: string;
    serverTime: string;
  }) => void;
  setCurrentIndex: (idx: number) => void;
  nextQuestion: () => void;
  prevQuestion: () => void;
  toggleMarked: (qid: string) => void;
  selectOption: (qid: string, key: string | null) => Promise<void>;
  flushQueue: () => Promise<void>;
  tickTimer: () => void;
  submitExam: () => Promise<void>;
  logTabEvent: () => void;
  resetExam: () => void;
}

export const useStudentExamStore = create<StudentExamStore>((set, get) => ({
  attemptId: null,
  status: 'idle',
  questions: [],
  currentIndex: 0,
  answers: {},
  marked: new Set<string>(),
  deadlineAt: null,
  remainingSeconds: 0,
  serverOffsetMs: 0,
  saveStatus: 'saved',
  retryQueue: JSON.parse(localStorage.getItem('nptel_retry_queue') || '[]'),

  initExam: (data) => {
    const serverTimeMs = new Date(data.serverTime).getTime();
    const clientTimeMs = Date.now();
    const serverOffsetMs = serverTimeMs - clientTimeMs;
    const deadlineAt = new Date(data.deadlineAt);

    // Merge unsent local queue with server answers (local newer wins)
    const localQueue: QueueItem[] = JSON.parse(localStorage.getItem('nptel_retry_queue') || '[]');
    const mergedAnswers = { ...data.answers };
    for (const item of localQueue) {
      mergedAnswers[item.qid] = item.chosen;
    }

    const diffSecs = Math.max(0, Math.floor((deadlineAt.getTime() - (Date.now() + serverOffsetMs)) / 1000));

    set({
      attemptId: data.attemptId,
      status: data.status,
      questions: data.questions,
      currentIndex: 0,
      answers: mergedAnswers,
      deadlineAt,
      serverOffsetMs,
      remainingSeconds: diffSecs,
      retryQueue: localQueue
    });

    if (localQueue.length > 0) {
      get().flushQueue();
    }
  },

  setCurrentIndex: (idx) => set({ currentIndex: idx }),
  nextQuestion: () => {
    const { currentIndex, questions } = get();
    if (currentIndex < questions.length - 1) {
      set({ currentIndex: currentIndex + 1 });
    }
  },
  prevQuestion: () => {
    const { currentIndex } = get();
    if (currentIndex > 0) {
      set({ currentIndex: currentIndex - 1 });
    }
  },
  toggleMarked: (qid) => {
    const marked = new Set(get().marked);
    if (marked.has(qid)) marked.delete(qid);
    else marked.add(qid);
    set({ marked });
  },

  selectOption: async (qid, key) => {
    const { attemptId, answers, retryQueue } = get();
    // Toggle: if clicking already selected, clear it
    const newChosen = answers[qid] === key ? null : key;
    
    // Optimistic UI update
    const updatedAnswers = { ...answers, [qid]: newChosen };
    set({ answers: updatedAnswers, saveStatus: 'saving' });

    const queueItem: QueueItem = { qid, chosen: newChosen, ts: Date.now() };
    const updatedQueue = [...retryQueue.filter(q => q.qid !== qid), queueItem];
    set({ retryQueue: updatedQueue });
    localStorage.setItem('nptel_retry_queue', JSON.stringify(updatedQueue));

    if (!attemptId) return;

    try {
      const res = await api.put(`/student/attempts/${attemptId}/answers/${qid}`, { chosen: newChosen });
      // Remove from queue on success
      const remainingQueue = get().retryQueue.filter(q => q.qid !== qid);
      set({
        saveStatus: remainingQueue.length > 0 ? 'saving' : 'saved',
        retryQueue: remainingQueue,
        remainingSeconds: res.remainingSeconds != null ? res.remainingSeconds : get().remainingSeconds
      });
      localStorage.setItem('nptel_retry_queue', JSON.stringify(remainingQueue));
    } catch (err) {
      // Keep in queue, mark offline
      set({ saveStatus: 'offline' });
    }
  },

  flushQueue: async () => {
    const { attemptId, retryQueue } = get();
    if (!attemptId || retryQueue.length === 0) return;

    set({ saveStatus: 'saving' });
    const currentQueue = [...retryQueue];
    const successfullyFlushed: string[] = [];

    for (const item of currentQueue) {
      try {
        await api.put(`/student/attempts/${attemptId}/answers/${item.qid}`, { chosen: item.chosen });
        successfullyFlushed.push(item.qid);
      } catch (err) {
        set({ saveStatus: 'offline' });
        return;
      }
    }

    const remaining = get().retryQueue.filter(q => !successfullyFlushed.includes(q.qid));
    set({
      retryQueue: remaining,
      saveStatus: remaining.length === 0 ? 'saved' : 'offline'
    });
    localStorage.setItem('nptel_retry_queue', JSON.stringify(remaining));
  },

  tickTimer: () => {
    const { deadlineAt, serverOffsetMs } = get();
    if (!deadlineAt) return;
    const nowServerMs = Date.now() + serverOffsetMs;
    const remaining = Math.max(0, Math.floor((deadlineAt.getTime() - nowServerMs) / 1000));
    set({ remainingSeconds: remaining });

    if (remaining === 0 && get().status === 'in_progress') {
      get().submitExam();
    }
  },

  submitExam: async () => {
    const { attemptId, flushQueue } = get();
    if (!attemptId) return;
    try {
      await flushQueue();
      await api.post(`/student/attempts/${attemptId}/submit`);
      set({ status: 'submitted' });
      localStorage.removeItem('nptel_retry_queue');
    } catch (err) {
      console.error('Submit failed:', err);
    }
  },

  logTabEvent: () => {
    const { attemptId } = get();
    if (!attemptId) return;
    api.post(`/student/attempts/${attemptId}/tab-event`).catch(() => {});
  },

  resetExam: () => set({
    attemptId: null,
    status: 'idle',
    questions: [],
    currentIndex: 0,
    answers: {},
    marked: new Set(),
    deadlineAt: null,
    remainingSeconds: 0,
    saveStatus: 'saved'
  })
}));
