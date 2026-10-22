import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStudentExamStore } from './store.js';
import QuestionPalette from './Palette.js';
import SubmitModal from './SubmitModal.js';
import { formatSecondsToTime } from '../lib/time.js';

interface ExamProps {
  examTitle: string;
  onFinished: () => void;
}

export default function StudentExam({ examTitle, onFinished }: ExamProps) {
  const {
    questions,
    currentIndex,
    answers,
    marked,
    remainingSeconds,
    saveStatus,
    status,
    nextQuestion,
    prevQuestion,
    toggleMarked,
    selectOption,
    tickTimer,
    submitExam,
    logTabEvent
  } = useStudentExamStore();

  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // 1-second interval for countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      tickTimer();
    }, 1000);
    return () => clearInterval(timer);
  }, [tickTimer]);

  // Tab switch listener
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        logTabEvent();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [logTabEvent]);

  // Keyboard navigation: Left/Right arrows, 1-4 option choice
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'ArrowRight') {
        nextQuestion();
      } else if (e.key === 'ArrowLeft') {
        prevQuestion();
      } else if (['1', '2', '3', '4'].includes(e.key)) {
        const currentQ = questions[currentIndex];
        if (currentQ) {
          const optIdx = parseInt(e.key, 10) - 1;
          const chosenKey = currentQ.options[optIdx]?.key;
          if (chosenKey) {
            selectOption(currentQ.qid, chosenKey);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, questions, nextQuestion, prevQuestion, selectOption]);

  // Redirect on submitted
  useEffect(() => {
    if (status === 'submitted' || status === 'auto_submitted') {
      onFinished();
    }
  }, [status, onFinished]);

  const currentQ = questions[currentIndex];
  if (!currentQ) {
    return <div className="p-8 text-center text-slate-500">Loading questions...</div>;
  }

  const isLastQuestion = currentIndex === questions.length - 1;
  const isFirstQuestion = currentIndex === 0;
  const currentChosen = answers[currentQ.qid];
  const isCurrentMarked = marked.has(currentQ.qid);
  const isLowTime = remainingSeconds < 300; // < 5 minutes

  return (
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden select-none">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center space-x-3">
          <span className="font-bold text-slate-800 text-lg truncate max-w-md">{examTitle}</span>
          <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded font-medium border border-slate-200">
            Question {currentIndex + 1} of {questions.length}
          </span>
        </div>

        {/* Center / Right: Timer & Save Indicator */}
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2 text-xs">
            {saveStatus === 'saved' && (
              <span className="text-emerald-600 font-medium flex items-center">
                <span className="w-2 h-2 bg-emerald-500 rounded-full mr-1.5"></span>
                Saved ✓
              </span>
            )}
            {saveStatus === 'saving' && (
              <span className="text-sky-600 font-medium flex items-center">
                <span className="w-2 h-2 bg-sky-500 rounded-full mr-1.5 animate-ping"></span>
                Saving...
              </span>
            )}
            {saveStatus === 'offline' && (
              <span className="text-amber-600 font-medium flex items-center">
                <span className="w-2 h-2 bg-amber-500 rounded-full mr-1.5"></span>
                Offline (will retry)
              </span>
            )}
          </div>

          {/* Countdown timer */}
          <div
            className={`px-4 py-1.5 rounded-lg font-mono font-bold text-base flex items-center space-x-2 border transition-colors ${
              isLowTime
                ? 'bg-red-50 text-red-600 border-red-200 animate-pulse'
                : 'bg-slate-100 text-slate-800 border-slate-300'
            }`}
          >
            <span>⏱</span>
            <span>{formatSecondsToTime(remainingSeconds)}</span>
          </div>

          <button
            onClick={() => setShowSubmitModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            Submit Test
          </button>
        </div>
      </header>

      {/* Main Body: Question Left, Options Right, Palette Far Right */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left / Center Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Scrollable Question and Options Area */}
          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Question Text & Code Snippet */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                <span className="font-bold text-slate-700 text-sm">Question {currentIndex + 1}</span>
                {isCurrentMarked && (
                  <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full">
                    Marked for Review
                  </span>
                )}
              </div>

              <div className="prose prose-slate max-w-none text-slate-800 text-base leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentQ.bodyMd}</ReactMarkdown>
              </div>

              {currentQ.codeSnippet && (
                <div className="mt-4 rounded-lg overflow-hidden border border-slate-800 bg-slate-900 text-slate-100 p-4 font-mono text-sm leading-relaxed whitespace-pre overflow-x-auto">
                  <code>{currentQ.codeSnippet}</code>
                </div>
              )}
            </div>

            {/* Options */}
            <div className="flex flex-col space-y-3">
              <div className="text-sm font-semibold text-slate-700 mb-1">Select one option:</div>

              {currentQ.options.map((opt, idx) => {
                const label = ['A', 'B', 'C', 'D'][idx];
                const isSelected = currentChosen === opt.key;

                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => selectOption(currentQ.qid, opt.key)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-start space-x-4 ${
                      isSelected
                        ? 'border-sky-600 bg-sky-50/70 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${
                        isSelected ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {label}
                    </div>
                    <div className="text-slate-800 text-base pt-1 leading-relaxed">
                      {opt.text}
                    </div>
                  </button>
                );
              })}

              {currentChosen && (
                <button
                  type="button"
                  onClick={() => selectOption(currentQ.qid, null)}
                  className="self-start text-xs text-slate-500 hover:text-red-600 underline pt-2"
                >
                  Clear response
                </button>
              )}
            </div>
          </div>

          {/* Bottom Action Bar */}
          <footer className="bg-white border-t border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm z-10">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => toggleMarked(currentQ.qid)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  isCurrentMarked
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                }`}
              >
                {isCurrentMarked ? 'Unmark Review' : 'Mark for Review'}
              </button>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={prevQuestion}
                disabled={isFirstQuestion}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 border border-slate-300 transition-colors"
              >
                ← Previous
              </button>

              <button
                onClick={nextQuestion}
                disabled={isLastQuestion}
                className="px-5 py-2 rounded-lg text-sm font-bold bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white transition-colors shadow-sm"
              >
                Next →
              </button>
            </div>
          </footer>
        </div>

        {/* Right Palette */}
        <QuestionPalette />
      </div>

      {/* Confirmation Modal */}
      <SubmitModal
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        onConfirm={async () => {
          await submitExam();
          setShowSubmitModal(false);
          onFinished();
        }}
      />
    </div>
  );
}
