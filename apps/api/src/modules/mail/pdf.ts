import PDFDocument from 'pdfkit';
import { getStudentAnalysis } from '../results/index.js';
import { uploadObject, isStorageAvailable } from '../../lib/storage.js';

const PAGE_LEFT = 40;
const PAGE_WIDTH = 515; // A4 (595pt) minus 40pt margins
const PAGE_BOTTOM = 790; // content must stop above the footer
const FOOTER_Y = 806;

/**
 * pdfkit's built-in Helvetica only supports WinAnsi characters, so anything else
 * (e.g. "→", "—", smart quotes) renders as garbage like "!'". Map the common ones
 * to safe equivalents and drop anything that is still unsupported.
 */
function clean(input: unknown): string {
  return String(input ?? '')
    .replace(/→|⇒|➜|➔/g, '>')
    .replace(/←/g, '<')
    .replace(/[—–]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[\u00A0\u2000-\u200B]/g, ' ')
    .replace(/```[a-zA-Z]*\n?/g, '')
    .replace(/`/g, '')
    .replace(/\r/g, '')
    .replace(/[^\n\t\x20-\x7E\xA1-\xFF\u2022]/g, '')
    .trim();
}

function truncate(text: string, max: number): string {
  const s = clean(text).replace(/\s*\n\s*/g, ' ');
  return s.length > max ? `${s.slice(0, max).trimEnd()}...` : s;
}

export async function generateStudentReportPdf(examId: string, studentId: string): Promise<Buffer> {
  const analysis = await getStudentAnalysis(examId, studentId);

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      if (isStorageAvailable) {
        uploadObject(`reports/${examId}/${studentId}.pdf`, buffer, 'application/pdf').catch(() => {});
      }
      resolve(buffer);
    });
    doc.on('error', err => reject(err));

    const ensureSpace = (height: number) => {
      if (doc.y + height > PAGE_BOTTOM) {
        doc.addPage();
        doc.x = PAGE_LEFT;
        doc.y = PAGE_LEFT;
        return true;
      }
      return false;
    };

    const heading = (text: string) => {
      ensureSpace(40);
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#000000').text(text, PAGE_LEFT, doc.y, { width: PAGE_WIDTH });
      doc.moveDown(0.4);
    };

    // ---------- Header ----------
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#000000')
      .text(clean(analysis.examTitle), PAGE_LEFT, doc.y, { align: 'center', width: PAGE_WIDTH });
    doc.font('Helvetica').fontSize(12).fillColor('#333333')
      .text('Mock Exam Performance Report', PAGE_LEFT, doc.y, { align: 'center', width: PAGE_WIDTH });
    doc.moveDown(1);

    doc.strokeColor('#000000').lineWidth(1).moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_LEFT + PAGE_WIDTH, doc.y).stroke();
    doc.moveDown(0.6);

    // ---------- Student details (one per line so long names never collide) ----------
    const detail = (label: string, value: string) => {
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000').text(label, 45, y, { width: 90, lineBreak: false });
      doc.font('Helvetica').text(clean(value), 140, y, { width: 410 });
      doc.moveDown(0.3);
    };
    detail('Student Name:', analysis.studentName);
    detail('Roll Number:', analysis.rollNo);
    doc.moveDown(0.8);

    // ---------- Score summary card ----------
    const cardY = doc.y;
    const cardH = 65;
    doc.lineWidth(1).rect(PAGE_LEFT, cardY, PAGE_WIDTH, cardH).fillAndStroke('#ffffff', '#000000');

    const cardCols = [
      { x: 55, w: 115, label: 'Assignment Score', value: `${analysis.assignmentMarks} / ${analysis.assignmentMax}` },
      { x: 180, w: 125, label: 'Scaled Exam Score', value: `${analysis.examScaled.toFixed(2)} / ${analysis.examMax}` },
      { x: 320, w: 110, label: 'Final Total', value: `${analysis.total.toFixed(2)} / 100` },
      { x: 440, w: 105, label: 'Result', value: analysis.passed ? analysis.gradeLabel : 'Not Passed', small: true },
    ];
    for (const c of cardCols) {
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(10)
        .text(c.label, c.x, cardY + 12, { width: c.w, lineBreak: false });
      doc.fontSize(c.small ? 11 : 14)
        .text(clean(c.value), c.x, cardY + (c.small ? 32 : 30), { width: c.w });
    }
    doc.x = PAGE_LEFT;
    doc.y = cardY + cardH + 18;

    // ---------- Question Attempt Summary ----------
    ensureSpace(100);
    heading('Question Attempt Summary');

    const totalQuestions = analysis.totalQuestions ?? analysis.allQuestions?.length ?? 
      ((analysis.correctCount ?? 0) + (analysis.wrongCount ?? 0) + (analysis.unansweredCount ?? 0));
    const attemptedCount = analysis.attemptedCount ?? (
      analysis.allQuestions
        ? analysis.allQuestions.filter(q => q.studentAnswer !== null && q.studentAnswer !== '').length
        : ((analysis.correctCount ?? 0) + (analysis.wrongCount ?? 0))
    );
    const unattemptedCount = analysis.unansweredCount ?? (totalQuestions - attemptedCount);
    const correctCount = analysis.correctCount ?? (
      analysis.allQuestions ? analysis.allQuestions.filter(q => q.isCorrect).length : 0
    );
    const wrongCount = analysis.wrongCount ?? (
      analysis.allQuestions ? analysis.allQuestions.filter(q => q.studentAnswer && !q.isCorrect).length : 0
    );

    const attemptCardY = doc.y;
    const attemptCardH = 55;
    doc.lineWidth(1).rect(PAGE_LEFT, attemptCardY, PAGE_WIDTH, attemptCardH).fillAndStroke('#ffffff', '#000000');

    const attemptCols = [
      { x: 50,  w: 92, label: 'Total Questions', value: `${totalQuestions}` },
      { x: 154, w: 86, label: 'Attempted',       value: `${attemptedCount}` },
      { x: 252, w: 98, label: 'Left (Unattempted)', value: `${unattemptedCount}` },
      { x: 362, w: 80, label: 'Correct',         value: `${correctCount}` },
      { x: 454, w: 88, label: 'Incorrect',       value: `${wrongCount}` },
    ];

    // Subtle vertical dividers between columns
    for (let i = 1; i < attemptCols.length; i++) {
      const divX = attemptCols[i].x - 10;
      doc.strokeColor('#e5e5e5').lineWidth(0.75)
        .moveTo(divX, attemptCardY + 8).lineTo(divX, attemptCardY + attemptCardH - 8).stroke();
    }

    for (const c of attemptCols) {
      doc.fillColor('#444444').font('Helvetica-Bold').fontSize(9)
        .text(c.label, c.x, attemptCardY + 12, { width: c.w, lineBreak: false });
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(15)
        .text(c.value, c.x, attemptCardY + 29, { width: c.w });
    }
    doc.x = PAGE_LEFT;
    doc.y = attemptCardY + attemptCardH + 18;

    // ---------- Topic table ----------
    heading('Topic Breakdown');

    const cols = [
      { key: 'topic', title: 'Topic', x: 46, w: 138 },
      { key: 'subtopic', title: 'Subtopic', x: 190, w: 136 },
      { key: 'score', title: 'Score', x: 332, w: 50 },
      { key: 'pct', title: 'Percentage', x: 388, w: 62 },
      { key: 'level', title: 'Performance', x: 456, w: 94 },
    ] as const;

    const drawTableHeader = () => {
      const top = doc.y;
      doc.lineWidth(1).rect(PAGE_LEFT, top, PAGE_WIDTH, 20).stroke('#000000');
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000');
      for (const c of cols) doc.text(c.title, c.x, top + 5, { width: c.w, lineBreak: false });
      doc.x = PAGE_LEFT;
      doc.y = top + 24;
    };
    drawTableHeader();

    for (const t of analysis.topicScores) {
      const cells: Record<(typeof cols)[number]['key'], string> = {
        topic: clean(t.topic),
        subtopic: clean(t.subtopic) || '-',
        score: `${t.correct} / ${t.total}`,
        pct: `${t.pct.toFixed(1)}%`,
        level: clean(t.level).toUpperCase(),
      };

      doc.font('Helvetica').fontSize(9);
      const rowH = Math.max(
        ...cols.map(c => doc.heightOfString(cells[c.key], { width: c.w })),
      ) + 8;

      if (doc.y + rowH > PAGE_BOTTOM) {
        doc.addPage();
        doc.x = PAGE_LEFT;
        doc.y = PAGE_LEFT;
        drawTableHeader();
      }

      const y = doc.y;
      for (const c of cols) {
        doc.font(c.key === 'level' ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#000000')
          .text(cells[c.key], c.x, y, { width: c.w });
      }
      doc.strokeColor('#cccccc').lineWidth(0.5)
        .moveTo(PAGE_LEFT, y + rowH - 3).lineTo(PAGE_LEFT + PAGE_WIDTH, y + rowH - 3).stroke();
      doc.x = PAGE_LEFT;
      doc.y = y + rowH;
    }
    doc.moveDown(1);

    // ---------- Focus areas ----------
    if (analysis.focusAreas.length > 0) {
      heading('Key Focus Areas for Revision');
      for (const f of analysis.focusAreas) {
        const text = `\u2022 [${clean(f.level).toUpperCase()} - ${f.pct.toFixed(0)}%] ${clean(f.recommendation)}`;
        doc.font('Helvetica').fontSize(9);
        ensureSpace(doc.heightOfString(text, { width: PAGE_WIDTH - 10 }) + 4);
        doc.fillColor('#000000').text(text, PAGE_LEFT + 10, doc.y, { width: PAGE_WIDTH - 10 });
        doc.moveDown(0.15);
      }
      doc.x = PAGE_LEFT;
      doc.moveDown(1);
    }

    // ---------- Questions to review ----------
    if (analysis.wrongQuestions.length > 0) {
      heading('Questions to Review');

      for (const [idx, w] of analysis.wrongQuestions.slice(0, 10).entries()) {
        const q = `Q${idx + 1}. [${clean(w.topic)}] ${truncate(w.bodyMd, 150)}`;
        const mine = `Your Answer: ${w.studentAnswer ? `Option ${w.studentAnswer.toUpperCase()}` : 'Not answered'}`;
        const correct = `Correct Answer: Option ${w.correctAnswer.toUpperCase()}`;
        const expl = w.explanationMd ? `Explanation: ${truncate(w.explanationMd, 180)}` : '';

        doc.font('Helvetica-Bold').fontSize(9);
        let h = doc.heightOfString(q, { width: PAGE_WIDTH });
        doc.font('Helvetica').fontSize(8);
        h += doc.heightOfString(mine, { width: PAGE_WIDTH }) + doc.heightOfString(correct, { width: PAGE_WIDTH });
        if (expl) h += doc.heightOfString(expl, { width: PAGE_WIDTH });
        ensureSpace(h + 12);

        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000').text(q, PAGE_LEFT, doc.y, { width: PAGE_WIDTH });
        doc.font('Helvetica').fontSize(8);
        doc.fillColor('#333333').text(mine, PAGE_LEFT, doc.y, { width: PAGE_WIDTH });
        doc.fillColor('#000000').text(correct, PAGE_LEFT, doc.y, { width: PAGE_WIDTH });
        if (expl) doc.fillColor('#444444').text(expl, PAGE_LEFT, doc.y, { width: PAGE_WIDTH });
        doc.moveDown(0.6);
      }
    }

    // ---------- Footer on every page ----------
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const prevBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0; // allow drawing in the bottom margin without auto page-break
      doc.font('Helvetica').fontSize(8).fillColor('#666666').text(
        `This is an automated performance report from NPTEL Mock Exam Portal. Not an official NPTEL document.   Page ${i + 1} of ${range.count}`,
        PAGE_LEFT, FOOTER_Y, { align: 'center', width: PAGE_WIDTH, lineBreak: false },
      );
      doc.page.margins.bottom = prevBottom;
    }

    doc.end();
  });
}
