const PDFDocument = require('pdfkit');

/**
 * Renders a single Typeform response as a clean question/answer PDF.
 * Returns a Buffer (in-memory, no disk writes needed on Vercel).
 */
function generateResponsePDF({ formName, submittedAt, answers }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text(formName);
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('gray').text(`Submitted: ${submittedAt}`);
    doc.fillColor('black');
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(1);

    // Question/answer pairs
    answers.forEach(({ label, value }) => {
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#333333').text(label);
      doc.fontSize(11).font('Helvetica').fillColor('black').text(value || '—');
      doc.moveDown(0.75);
    });

    doc.end();
  });
}

module.exports = { generateResponsePDF };
