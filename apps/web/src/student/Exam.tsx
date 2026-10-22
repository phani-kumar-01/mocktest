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
    return <div className="p-8 text-center text-neutral-500 font-bold">Loading questions...</div>;
  }

  const isLastQuestion = currentIndex === questions.length - 1;
  const isFirstQuestion = currentIndex === 0;
  const currentChosen = answers[currentQ.qid];
  const isCurrentMarked = marked.has(currentQ.qid);
  const isLowTime = remainingSeconds < 300; // < 5 minutes

  return (
    <div className="h-screen flex flex-col bg-neutral-100 overflow-hidden select-none text-black">
      {/* Top Navbar */}
      <header className="bg-white border-b-2 border-black px-6 py-3 flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <span className="font-bold text-black text-lg truncate max-w-md uppercase">{examTitle}</span>
          <span className="text-xs bg-neutral-100 text-black px-2.5 py-1 rounded font-bold border border-black uppercase">
            Question {currentIndex + 1} of {questions.length}
          </span>
        </div>

        {/* Center / Right: Timer & Save Indicator */}
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2 text-xs">
            {saveStatus === 'saved' && (
              <span className="text-black font-bold flex items-center">
                <span className="w-2 h-2 bg-black rounded-full mr-1.5"></span>
                Saved ✓
              </span>
            )}
            {saveStatus === 'saving' && (
              <span className="text-neutral-500 font-bold flex items-center">
                <span className="w-2 h-2 bg-neutral-400 rounded-full mr-1.5"></span>
                Saving...
              </span>
            )}
            {saveStatus === 'offline' && (
              <span className="text-neutral-700 font-bold flex items-center">
                <span className="w-2 h-2 bg-neutral-600 rounded-full mr-1.5"></span>
                Offline (will retry)
              </span>
            )}
          </div>

          {/* Countdown timer */}
          <div
            className={`px-4 py-1.5 rounded font-mono font-black text-base flex items-center space-x-2 border-2 border-black transition-colors ${
              isLowTime
                ? 'bg-black text-white'
                : 'bg-neutral-100 text-black'
            }`}
          >
            <span className="text-xs font-bold">Time Left :</span>
            <span>{formatSecondsToTime(remainingSeconds)}</span>
          </div>

          <button
            onClick={() => setShowSubmitModal(true)}
            className="bg-black hover:bg-neutral-800 text-white font-bold text-sm px-4 py-2 rounded border border-black uppercase tracking-wider transition-colors"
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
          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 bg-white">
            {/* Question Text & Code Snippet */}
            <div className="bg-white rounded border-2 border-black p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-black">
                <span className="font-bold text-black text-sm uppercase">Question {currentIndex + 1}</span>
                {isCurrentMarked && (
                  <span className="text-xs font-bold text-black bg-neutral-200 border border-black px-2.5 py-0.5 rounded uppercase">
                    Marked for Review
                  </span>
                )}
              </div>

              <div className="prose max-w-none text-black text-base leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentQ.bodyMd}</ReactMarkdown>
              </div>

              {currentQ.codeSnippet && (
                <div className="mt-4 rounded border-2 border-black bg-neutral-50 text-black p-4 font-mono text-sm leading-relaxed whitespace-pre overflow-x-auto">
                  <code>{currentQ.codeSnippet}</code>
                </div>
              )}
            </div>

            {/* Options */}
            <div className="flex flex-col space-y-3">
              <div className="text-sm font-bold uppercase text-black mb-1">Select one option:</div>

              {currentQ.options.map((opt, idx) => {
                const label = ['A', 'B', 'C', 'D'][idx];
                const isSelected = currentChosen === opt.key;

                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => selectOption(currentQ.qid, opt.key)}
                    className={`w-full text-left p-4 rounded border-2 transition-all flex items-start space-x-4 ${
                      isSelected
                        ? 'border-black bg-neutral-100 font-semibold'
                        : 'border-neutral-300 bg-white hover:border-black hover:bg-neutral-50'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 transition-colors border ${
                        isSelected ? 'bg-black text-white border-black' : 'bg-white text-black border-black'
                      }`}
                    >
                      {label}
                    </div>
                    <div className="text-black text-base pt-1 leading-relaxed">
                      {opt.text}
                    </div>
                  </button>
                );
              })}

              {currentChosen && (
                <button
                  type="button"
                  onClick={() => selectOption(currentQ.qid, null)}
                  className="self-start text-xs text-neutral-600 hover:text-black font-bold underline pt-2"
                >
                  Clear response
                </button>
              )}
            </div>
          </div>

          {/* Bottom Action Bar */}
          <footer className="bg-white border-t-2 border-black px-6 py-3 flex items-center justify-between z-10">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => toggleMarked(currentQ.qid)}
                className={`px-4 py-2 rounded text-sm font-bold border border-black uppercase transition-colors ${
                  isCurrentMarked
                    ? 'bg-black text-white'
                    : 'bg-white hover:bg-neutral-100 text-black'
                }`}
              >
                {isCurrentMarked ? 'Unmark Review' : 'Mark for Review'}
              </button>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={prevQuestion}
                disabled={isFirstQuestion}
                className="px-4 py-2 rounded text-sm font-bold bg-white hover:bg-neutral-100 disabled:opacity-30 text-black border border-black uppercase transition-colors"
              >
                ← Previous
              </button>

              <button
                onClick={nextQuestion}
                disabled={isLastQuestion}
                className="px-5 py-2 rounded text-sm font-bold bg-black hover:bg-neutral-800 disabled:opacity-30 text-white border border-black uppercase transition-colors"
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
