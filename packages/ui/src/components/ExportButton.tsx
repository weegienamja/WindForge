import type { ReactNode } from 'react';
import React, { useState, useCallback, useRef } from 'react';
import type { SiteAnalysis } from '@jamieblair/windforge-core';
import type { WindSiteTheme } from '../styles/theme.js';

export interface ExportButtonProps {
  analysis: SiteAnalysis;
  /** Optional ref to a DOM element containing rendered charts to capture */
  chartsContainerRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
  label?: string;
  theme?: Partial<WindSiteTheme>;
}

export function ExportButton({
  analysis,
  chartsContainerRef,
  className,
  label = 'Export PDF',
  theme: _theme,
}: ExportButtonProps): ReactNode {
  const [exporting, setExporting] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      // Dynamic imports to avoid bundling these for consumers who don't use export
      const [{ default: jsPDF }, html2canvasModule] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);
      const html2canvas = html2canvasModule.default;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      // Header
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('WindForge Screening Report', margin, y);
      y += 10;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Location: ${analysis.coordinate.lat.toFixed(4)}, ${analysis.coordinate.lng.toFixed(4)}`,
        margin,
        y,
      );
      y += 5;
      doc.text(
        `Analysis date: ${new Date(analysis.metadata.analysedAt).toLocaleString()}`,
        margin,
        y,
      );
      y += 5;
      doc.text(`Hub height: ${analysis.metadata.hubHeightM}m`, margin, y);
      y += 5;
      doc.text(`Wind shear alpha: ${analysis.metadata.windShearAlpha.toFixed(3)}`, margin, y);
      y += 10;

      // Composite score
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(
        analysis.compositeScore === null
          ? 'Composite screening score: unavailable'
          : `Composite screening score: ${analysis.compositeScore}/100`,
        margin,
        y,
      );
      y += 10;

      // Configured screening exclusions (legacy schema field: hardConstraints)
      if (analysis.hardConstraints.length > 0) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(220, 38, 38);
        doc.text('Potential Screening Exclusions', margin, y);
        y += 6;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        for (const c of analysis.hardConstraints) {
          doc.text(`- ${c.description}`, margin + 4, y);
          y += 5;
        }
        doc.setTextColor(0, 0, 0);
        y += 4;
      }

      // Warnings
      if (analysis.warnings.length > 0) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(245, 158, 11);
        doc.text('Warnings', margin, y);
        y += 6;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        for (const w of analysis.warnings) {
          doc.text(`- ${w.description}`, margin + 4, y);
          y += 5;
        }
        doc.setTextColor(0, 0, 0);
        y += 4;
      }

      // Factor breakdown table
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Factor Breakdown', margin, y);
      y += 7;

      // Table header
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      const col0 = margin;
      const col1 = margin + 45;
      const col2 = margin + 62;
      const col3 = margin + 78;
      const col4 = margin + 100;
      doc.text('Factor', col0, y);
      doc.text('Score', col1, y);
      doc.text('Weight', col2, y);
      doc.text('Weighted', col3, y);
      doc.text('Confidence', col4, y);
      y += 2;
      doc.line(margin, y, margin + contentWidth, y);
      y += 4;

      // Table rows
      doc.setFont('helvetica', 'normal');
      for (const factor of analysis.factors) {
        const name = formatFactorName(factor.factor);
        doc.text(name, col0, y);
        doc.text(`${factor.score}`, col1, y);
        doc.text(`${(factor.weight * 100).toFixed(0)}%`, col2, y);
        doc.text(`${factor.weightedScore.toFixed(1)}`, col3, y);
        doc.text(factor.confidence, col4, y);
        y += 5;

        // Detail string (wrapped)
        if (factor.detail) {
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          const lines = doc.splitTextToSize(factor.detail, contentWidth - 4);
          for (const line of lines) {
            doc.text(line as string, margin + 4, y);
            y += 4;
          }
          doc.setFontSize(9);
          doc.setTextColor(0, 0, 0);
          y += 2;
        }

        // Check if we need a new page
        if (y > 270) {
          doc.addPage();
          y = margin;
        }
      }

      y += 6;

      // Data sources
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Data Sources', margin, y);
      y += 6;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Sources used: ${analysis.metadata.sourcesUsed.join(', ') || 'N/A'}`, margin, y);
      y += 4;
      if (analysis.metadata.sourcesFailed.length > 0) {
        doc.text(`Sources failed: ${analysis.metadata.sourcesFailed.join(', ')}`, margin, y);
        y += 4;
      }
      doc.text(`Duration: ${analysis.metadata.durationMs}ms`, margin, y);
      y += 8;

      // Charts capture
      if (chartsContainerRef?.current) {
        if (y > 200) {
          doc.addPage();
          y = margin;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Wind Analysis Charts', margin, y);
        y += 8;

        try {
          const canvas = await html2canvas(chartsContainerRef.current, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
          });
          const imgData = canvas.toDataURL('image/png');
          const imgHeight = (canvas.height / canvas.width) * contentWidth;

          // May need multiple pages for tall charts
          let remainingHeight = imgHeight;
          let sourceY = 0;
          const pageContentHeight = 270 - y;

          if (imgHeight <= pageContentHeight) {
            doc.addImage(imgData, 'PNG', margin, y, contentWidth, imgHeight);
            y += imgHeight + 5;
          } else {
            // First chunk
            doc.addImage(imgData, 'PNG', margin, y, contentWidth, imgHeight);
            remainingHeight -= pageContentHeight;
            sourceY += pageContentHeight;

            while (remainingHeight > 0) {
              doc.addPage();
              y = margin;
              const chunkHeight = Math.min(remainingHeight, 270);
              doc.addImage(imgData, 'PNG', margin, y - sourceY, contentWidth, imgHeight);
              remainingHeight -= chunkHeight;
              sourceY += chunkHeight;
            }
            y = margin + Math.min(remainingHeight + (270 - margin), 270);
          }
        } catch {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'italic');
          doc.text('Charts could not be captured.', margin, y);
          y += 6;
        }
      }

      // Disclaimer footer
      if (y > 250) {
        doc.addPage();
        y = margin;
      }
      y = Math.max(y, 260);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 116, 139);
      const disclaimer =
        'This screening analysis is not a statutory search, planning opinion, engineering design, or bankable energy assessment. ' +
        'Confirm constraints with authoritative sources and use site measurements and qualified professional review.';
      const disclaimerLines = doc.splitTextToSize(disclaimer, contentWidth);
      for (const line of disclaimerLines) {
        doc.text(line as string, margin, y);
        y += 3;
      }

      doc.save(
        `wind-site-report-${analysis.coordinate.lat.toFixed(2)}_${analysis.coordinate.lng.toFixed(2)}.pdf`,
      );
    } catch (e) {
      console.error('PDF export failed:', e);
    } finally {
      setExporting(false);
    }
  }, [analysis, chartsContainerRef]);

  return React.createElement(
    'button',
    {
      ref: buttonRef,
      onClick: handleExport,
      disabled: exporting,
      className,
      style: {
        padding: '8px 20px',
        backgroundColor: exporting ? '#94a3b8' : 'var(--wsi-primary, #0f172a)',
        color: '#fff',
        border: 'none',
        borderRadius: 6,
        fontSize: 14,
        fontWeight: 600,
        cursor: exporting ? 'wait' : 'pointer',
      },
      'aria-label': exporting ? 'Exporting PDF...' : 'Export analysis as PDF',
    },
    exporting ? 'Exporting...' : label,
  );
}

function formatFactorName(factor: string): string {
  return factor
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}
