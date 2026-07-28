// Client-side PDF export for the register pages (consultation, CPN,
// accouchement) — these tables run 19 to 27 columns wide, so the PDF is
// always generated landscape with a shrunk font so a full month fits
// without clipping columns. Runs entirely in the browser (no server
// function), which keeps it Vercel-serverless-friendly.
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

function formatMonthLabel(month: string): string {
  const [yearStr, monthStr] = month.split('-');
  const d = new Date(Number(yearStr), Number(monthStr) - 1, 1);
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

export function downloadRegisterPdf({
  title,
  clinicName,
  month,
  headers,
  rows,
  fileName,
}: {
  title: string;
  clinicName: string;
  month: string;
  headers: string[];
  rows: string[][];
  fileName: string;
}): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFontSize(13);
  doc.text(title, 10, 10);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`${clinicName} — ${formatMonthLabel(month)}`, 10, 16);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 20,
    head: [headers],
    body: rows,
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 1.2, overflow: 'linebreak' },
    headStyles: { fillColor: [42, 120, 214], textColor: 255, fontStyle: 'bold' },
    margin: { left: 6, right: 6 },
  });

  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Page ${i} / ${pageCount}`, pageWidth - 24, pageHeight - 5);
  }

  doc.save(fileName);
}
