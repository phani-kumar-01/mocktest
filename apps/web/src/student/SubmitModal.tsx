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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded max-w-md w-full border-2 border-black overflow-hidden text-black">
        <div className="p-6 text-center space-y-4">
          <h3 className="text-xl font-bold text-black uppercase">Submit Exam</h3>
          <p className="text-neutral-600 text-sm">
            Are you sure you want to finish and submit your exam? You cannot modify answers after submission.
          </p>

          <div className="grid grid-cols-3 gap-3 py-3 border-y border-black text-center">
            <div className="bg-neutral-100 p-3 rounded border border-black">
              <span className="block text-2xl font-black text-black">{answered}</span>
              <span className="text-xs text-neutral-600 font-bold uppercase">Answered</span>
            </div>
            <div className="bg-white p-3 rounded border border-black">
              <span className="block text-2xl font-black text-black">{unanswered}</span>
              <span className="text-xs text-neutral-600 font-bold uppercase">Unanswered</span>
            </div>
            <div className="bg-neutral-200 p-3 rounded border border-black">
              <span className="block text-2xl font-black text-black">{markedCount}</span>
              <span className="text-xs text-neutral-600 font-bold uppercase">Marked</span>
            </div>
          </div>
        </div>

        <div className="bg-neutral-50 px-6 py-4 flex items-center justify-end space-x-3 border-t border-black">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm text-black font-semibold hover:bg-neutral-200 rounded border border-neutral-300 transition-colors"
          >
            Cancel & Return
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="px-5 py-2 text-sm bg-black hover:bg-neutral-800 disabled:bg-neutral-400 text-white font-bold rounded border border-black uppercase tracking-wider transition-colors"
          >
            {submitting ? 'Submitting...' : 'Yes, Submit Now'}
          </button>
        </div>
      </div>
    </div>
  );
}
