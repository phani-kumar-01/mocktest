import { useState } from 'react';
import { useStudentExamStore } from './store.js';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function SubmitModal({ isOpen, onClose, onConfirm }: ModalProps) {
  const { questions, answers, marked } = useStudentExamStore();
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const total = questions.length;
  let answered = 0;
  for (const q of questions) {
    if (answers[q.qid] != null) answered++;
  }
  const unanswered = total - answered;
  const markedCount = marked.size;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        <div className="p-6 text-center space-y-4">
          <h3 className="text-xl font-bold text-slate-800">Submit Exam</h3>
          <p className="text-slate-600 text-sm">
            Are you sure you want to finish and submit your exam? You cannot modify answers after submission.
          </p>

          <div className="grid grid-cols-3 gap-3 py-3 border-y border-slate-100 text-center">
            <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
              <span className="block text-2xl font-bold text-emerald-600">{answered}</span>
              <span className="text-xs text-slate-500 font-medium">Answered</span>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="block text-2xl font-bold text-slate-600">{unanswered}</span>
              <span className="text-xs text-slate-500 font-medium">Unanswered</span>
            </div>
            <div className="bg-amber-50 p-3 rounded-xl border border-amber-100">
              <span className="block text-2xl font-bold text-amber-600">{markedCount}</span>
              <span className="text-xs text-slate-500 font-medium">Marked</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 px-6 py-4 flex items-center justify-end space-x-3 border-t border-slate-200">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm text-slate-700 font-medium hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancel & Return
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="px-5 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-bold rounded-lg shadow transition-colors"
          >
            {submitting ? 'Submitting...' : 'Yes, Submit Now'}
          </button>
        </div>
      </div>
    </div>
  );
}
