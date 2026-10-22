import PDFDocument from 'pdfkit';
import { getStudentAnalysis } from '../results/index.js';

export async function generateStudentReportPdf(examId: string, studentId: string): Promise<Buffer> {
  const analysis = await getStudentAnalysis(examId, studentId);

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', err => reject(err));

    // Header
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#000000').text(analysis.examTitle, { align: 'center' });
    doc.fontSize(12).font('Helvetica').fillColor('#333333').text('Mock Exam Performance Report', { align: 'center' });
    doc.moveDown(1);

    // Student Details
    doc.strokeColor('#000000').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.5);

    const startY = doc.y;
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000').text('Student Name:', 45, startY);
    doc.font('Helvetica').text(analysis.studentName, 135, startY);

    doc.font('Helvetica-Bold').text('Roll Number:', 330, startY);
    doc.font('Helvetica').text(analysis.rollNo, 415, startY);
    doc.moveDown(1.5);

    // Score Summary Card
    const cardY = doc.y;
    doc.rect(40, cardY, 515, 65).fillAndStroke('#ffffff', '#000000');

    doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold');
    doc.text('Assignment Score', 55, cardY + 12);
    doc.text('Scaled Exam Score', 180, cardY + 12);
    doc.text('Final Total', 320, cardY + 12);
    doc.text('Result', 440, cardY + 12);

    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000');
    doc.text(`${analysis.assignmentMarks} / ${analysis.assignmentMax}`, 55, cardY + 30);
    doc.text(`${analysis.examScaled.toFixed(2)} / ${analysis.examMax}`, 180, cardY + 30);

    const totalColor = '#000000';
    doc.fillColor(totalColor).text(`${analysis.total.toFixed(2)} / 100`, 320, cardY + 30);

    doc.fontSize(11).text(analysis.passed ? analysis.gradeLabel : 'Not Passed', 440, cardY + 32);
    doc.y = cardY + 80;

    // Topic Performance Table
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000').text('Topic Breakdown', 40);
    doc.moveDown(0.4);

    const tableTop = doc.y;
    doc.rect(40, tableTop, 515, 20).stroke('#000000');
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000');
    doc.text('Topic', 50, tableTop + 5);
    doc.text('Subtopic', 180, tableTop + 5);
    doc.text('Score', 320, tableTop + 5);
    doc.text('Percentage', 410, tableTop + 5);
    doc.text('Performance', 490, tableTop + 5);

    let curY = tableTop + 22;
    for (const t of analysis.topicScores) {
      if (curY > 720) {
        doc.addPage();
        curY = 50;
      }
      doc.fontSize(9).font('Helvetica').fillColor('#000000');
      doc.text(t.topic, 50, curY);
      doc.text(t.subtopic || '—', 180, curY);
      doc.text(`${t.correct} / ${t.total}`, 320, curY);
      doc.text(`${t.pct.toFixed(1)}%`, 410, curY);

      const badgeColor = '#000000';
      doc.font('Helvetica-Bold').fillColor(badgeColor).text(t.level.toUpperCase(), 490, curY);

      curY += 18;
    }

    doc.y = curY + 15;

    // Focus Areas
    if (analysis.focusAreas.length > 0) {
      if (doc.y > 680) doc.addPage();
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000').text('Key Focus Areas for Revision', 40);
      doc.moveDown(0.3);

      for (const f of analysis.focusAreas) {
        doc.fontSize(9).font('Helvetica').fillColor('#000000').text(`• [${f.level.toUpperCase()} - ${f.pct.toFixed(0)}%] ${f.recommendation}`, { indent: 10 });
      }
      doc.moveDown(1);
    }

    // Questions to Review
    if (analysis.wrongQuestions.length > 0) {
      if (doc.y > 650) doc.addPage();
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000').text('Questions to Review', 40);
      doc.moveDown(0.4);

      const reviewList = analysis.wrongQuestions.slice(0, 10);
      for (const [idx, w] of reviewList.entries()) {
        if (doc.y > 680) doc.addPage();

        doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000').text(`Q${idx + 1}. [${w.topic}] ${w.bodyMd.slice(0, 150)}${w.bodyMd.length > 150 ? '...' : ''}`);
        doc.fontSize(8).font('Helvetica');
        doc.fillColor('#333333').text(`Your Answer: Option ${w.studentAnswer ? w.studentAnswer.toUpperCase() : 'None'}`);
        doc.fillColor('#000000').text(`Correct Answer: Option ${w.correctAnswer.toUpperCase()}`);
        if (w.explanationMd) {
          doc.fillColor('#444444').text(`Explanation: ${w.explanationMd.slice(0, 180)}`);
        }
        doc.moveDown(0.5);
      }
    }

    // Footer
    doc.fontSize(8).font('Helvetica').fillColor('#666666').text('This is an automated performance report from NPTEL Mock Exam Portal. Not an official NPTEL document.', 40, 780, { align: 'center', width: 515 });

    doc.end();
  });
}
