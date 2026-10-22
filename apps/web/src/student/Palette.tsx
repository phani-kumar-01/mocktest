import { useStudentExamStore } from './store.js';

export default function QuestionPalette() {
  const { questions, currentIndex, answers, marked, setCurrentIndex } = useStudentExamStore();

  return (
    <div className="bg-white border-l border-black w-80 flex flex-col h-full text-black">
      <div className="p-4 border-b border-black">
        <h3 className="font-bold text-black text-sm uppercase">Question Palette</h3>
        {/* Legend */}
        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
          <div className="flex items-center space-x-2">
            <span className="w-3.5 h-3.5 rounded bg-black"></span>
            <span className="text-black font-semibold">Answered</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-3.5 h-3.5 rounded bg-white border border-black"></span>
            <span className="text-neutral-600">Unanswered</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-3.5 h-3.5 rounded bg-neutral-200 border-2 border-dashed border-black"></span>
            <span className="text-black font-semibold">Marked</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-3.5 h-3.5 rounded border-2 border-black bg-white ring-2 ring-black"></span>
            <span className="text-black font-bold">Current</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-5 gap-2.5">
          {questions.map((q, idx) => {
            const hasAnswer = answers[q.qid] != null;
            const isMarked = marked.has(q.qid);
            const isCurrent = idx === currentIndex;

            let badgeStyle = 'bg-white text-black hover:bg-neutral-100 border border-neutral-300';
            if (isMarked) {
              badgeStyle = 'bg-neutral-200 text-black font-bold border-2 border-dashed border-black';
            } else if (hasAnswer) {
              badgeStyle = 'bg-black text-white font-bold border border-black';
            }

            return (
              <button
                key={q.qid}
                onClick={() => setCurrentIndex(idx)}
                className={`h-10 rounded text-sm transition-all flex items-center justify-center font-mono ${badgeStyle} ${
                  isCurrent ? 'ring-2 ring-black ring-offset-2 scale-105 font-black' : ''
                }`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
