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
    securityViolations,
    requireSafeBrowser,
    nextQuestion,
    prevQuestion,
    toggleMarked,
    selectOption,
    tickTimer,
    submitExam,
    logTabEvent,
    logSecurityEvent
  } = useStudentExamStore();

  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(true);

  // Fullscreen helper
  const enterFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if ((document.documentElement as any).webkitRequestFullscreen) {
        await (document.documentElement as any).webkitRequestFullscreen();
      }
      setIsFullscreen(true);
    } catch (err) {
      console.warn('Fullscreen request failed:', err);
      // Fallback: don't permanently block if browser prevents programmatic fullscreen
      setIsFullscreen(true);
    }
  };

  // Safe Browser Fullscreen Lockdown Guard
  useEffect(() => {
    if (!requireSafeBrowser) return;

    // Check initial state
    const isFs = Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement);
    if (!isFs) {
      setIsFullscreen(false);
    }

    const handleFullscreenChange = () => {
      const activeFs = Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(activeFs);
      if (!activeFs) {
        logSecurityEvent('fullscreen_exit', 'Exited fullscreen mode');
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [requireSafeBrowser, logSecurityEvent]);

  // Window Focus / Blur Guard (Alt-Tab, Switching Windows)
  useEffect(() => {
    if (!requireSafeBrowser) return;

    const handleBlur = () => {
      logSecurityEvent('window_blur', 'Window lost focus / switched app');
    };

    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [requireSafeBrowser, logSecurityEvent]);

  // Clipboard & Context Menu Anti-Cheat Blockers
  useEffect(() => {
    if (!requireSafeBrowser) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      logSecurityEvent('clipboard_attempt', 'Right-click context menu blocked');
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      logSecurityEvent('clipboard_attempt', 'Copy attempt blocked');
    };

    const handleCut = (e: ClipboardEvent) => {
      e.preventDefault();
      logSecurityEvent('clipboard_attempt', 'Cut attempt blocked');
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      logSecurityEvent('clipboard_attempt', 'Paste attempt blocked');
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('cut', handleCut);
    document.addEventListener('paste', handlePaste);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('cut', handleCut);
      document.removeEventListener('paste', handlePaste);
    };
  }, [requireSafeBrowser, logSecurityEvent]);

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

  // Keyboard navigation & DevTools/Shortcut Blocker
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Safe Browser: Block devtools and inspect keys
      if (requireSafeBrowser) {
        const isF12 = e.key === 'F12';
        const isPrintScreen = e.key === 'PrintScreen';
        const isCtrlShift = e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase());
        const isCtrlKeyBlocked = e.ctrlKey && ['u', 'p', 's', 'c', 'v'].includes(e.key.toLowerCase());

        if (isF12 || isPrintScreen || isCtrlShift || isCtrlKeyBlocked) {
          e.preventDefault();
          e.stopPropagation();
          logSecurityEvent('shortcut_blocked', `Keyboard shortcut blocked: ${e.key}`);
          return;
        }
      }

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
  }, [currentIndex, questions, nextQuestion, prevQuestion, selectOption, requireSafeBrowser, logSecurityEvent]);

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
      {/* Safe Browser Fullscreen Blocker Overlay */}
      {requireSafeBrowser && !isFullscreen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-6 text-center">
          <div className="bg-white max-w-md w-full rounded border-2 border-red-600 p-8 space-y-5 shadow-2xl">
            <div className="w-16 h-16 bg-red-100 text-red-600 border-2 border-red-600 rounded-full flex items-center justify-center mx-auto text-3xl font-black">
              ⚠️
            </div>
            <div>
              <h2 className="text-xl font-black text-black uppercase tracking-tight">Safe Browser Lockdown Active</h2>
              <p className="text-xs text-neutral-600 mt-2 font-medium">
                You have exited full-screen mode or focus was lost. Your exam is temporarily suspended until you return to full-screen. This violation has been recorded in the proctor audit log.
              </p>
            </div>
            <div className="bg-neutral-100 p-3 rounded text-xs text-neutral-800 font-bold border border-neutral-300 flex items-center justify-between">
              <span>Security Warnings:</span>
              <span className="text-red-600 text-sm font-black">{securityViolations} recorded</span>
            </div>
            <button
              onClick={enterFullscreen}
              className="w-full py-3.5 px-6 bg-black hover:bg-neutral-800 text-white font-black text-sm uppercase tracking-wider rounded border border-black transition-all"
            >
              Return to Safe Fullscreen Mode
            </button>
          </div>
        </div>
      )}

      {/* Top Navbar */}
      <header className="bg-white border-b-2 border-black px-6 py-3 flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <span className="font-bold text-black text-lg truncate max-w-md uppercase">{examTitle}</span>
          <span className="text-xs bg-neutral-100 text-black px-2.5 py-1 rounded font-bold border border-black uppercase">
            Question {currentIndex + 1} of {questions.length}
          </span>
          {requireSafeBrowser && (
            <span className="text-xs bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded font-bold border border-emerald-600 flex items-center space-x-1 uppercase">
              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
              <span>Safe Browser Active</span>
              {securityViolations > 0 && (
                <span className="ml-1 bg-red-600 text-white px-1.5 py-0.2 rounded text-[10px]">
                  {securityViolations}
                </span>
              )}
            </span>
          )}
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
