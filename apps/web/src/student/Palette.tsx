import { useStudentExamStore } from './store.js';

export default function QuestionPalette() {
  const { questions, currentIndex, answers, marked, setCurrentIndex } = useStudentExamStore();

  return (
    <div className="bg-white border-l border-slate-200 w-80 flex flex-col h-full shadow-sm">
      <div className="p-4 border-b border-slate-200">
        <h3 className="font-bold text-slate-800 text-sm">Question Palette</h3>
        {/* Legend */}
        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
          <div className="flex items-center space-x-2">
            <span className="w-3.5 h-3.5 rounded bg-emerald-500"></span>
            <span className="text-slate-600">Answered</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-3.5 h-3.5 rounded bg-slate-200 border border-slate-300"></span>
            <span className="text-slate-600">Unanswered</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-3.5 h-3.5 rounded bg-amber-400"></span>
            <span className="text-slate-600">Marked</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-3.5 h-3.5 rounded border-2 border-sky-500 bg-white"></span>
            <span className="text-slate-600">Current</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-5 gap-2.5">
          {questions.map((q, idx) => {
            const hasAnswer = answers[q.qid] != null;
            const isMarked = marked.has(q.qid);
            const isCurrent = idx === currentIndex;

            let bgColor = 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300';
            if (isMarked) {
              bgColor = 'bg-amber-400 text-amber-950 font-bold border border-amber-500';
            } else if (hasAnswer) {
              bgColor = 'bg-emerald-500 text-white font-bold border border-emerald-600';
            }

            return (
              <button
                key={q.qid}
                onClick={() => setCurrentIndex(idx)}
                className={`h-10 rounded-lg text-sm transition-all flex items-center justify-center font-mono ${bgColor} ${
                  isCurrent ? 'ring-2 ring-sky-500 ring-offset-2 scale-105' : ''
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
