import { useState, useMemo } from 'react';
import { jsPDF } from 'jspdf';

const DOCU_SIGN_ANCHORS = ['/sig1/', '/sig2/', '/date1/', '/date2/'];
// Logo/icon in public/ folder (spaces URL-encoded)
const LOGO_PNG = '/SHAED%20Logo%20-%20Updated.png';
const LOGO_SVG = '/SHAED%20Logo.svg';
const ICON_PNG = '/SHAED%20Icon%20-%20Updated.png';

/** Letterhead logo: try PNG, then SVG, then icon, fallback to wordmark text */
function LOILetterheadLogo() {
  const [src, setSrc] = useState(LOGO_PNG);
  const [failed, setFailed] = useState(false);

  const handleError = () => {
    if (src === LOGO_PNG) {
      setSrc(LOGO_SVG);
    } else if (src === LOGO_SVG) {
      setSrc(ICON_PNG);
    } else {
      setFailed(true);
    }
  };

  if (failed) {
    return <span className="loi-letterhead-wordmark">SHAED</span>;
  }
  return (
    <img
      src={src}
      alt="SHAED"
      className="loi-letterhead-logo"
      onError={handleError}
    />
  );
}

function isAllCapsSection(line) {
  const t = line.trim();
  if (t.length < 2) return false;
  if (!/[A-Z]/.test(t)) return false;
  return t === t.toUpperCase();
}

function isListItem(line) {
  const t = line.trim();
  return /^[•\-]\s/.test(t) || (t.startsWith('-') && t.length > 1);
}

function stripListPrefix(line) {
  return line.trim().replace(/^[•\-]\s*/, '');
}

/** Renders inline content: **bold** and invisible DocuSign anchors */
function renderInline(text, keyPrefix) {
  const nodes = [];
  let key = 0;
  const anchorRe = /(\/sig1\/|\/sig2\/|\/date1\/|\/date2\/)/g;
  let lastIndex = 0;
  let m;
  while ((m = anchorRe.exec(text)) !== null) {
    if (m.index > lastIndex) {
      nodes.push(...renderBoldFragments(text.slice(lastIndex, m.index), `${keyPrefix}-${key++}`));
    }
    nodes.push(
      <span key={`${keyPrefix}-${key++}`} className="loi-docusign-anchor" aria-hidden="true">
        {m[1]}
      </span>
    );
    lastIndex = m.index + m[1].length;
  }
  if (lastIndex < text.length) {
    nodes.push(...renderBoldFragments(text.slice(lastIndex), `${keyPrefix}-${key++}`));
  }
  return nodes;
}

function renderBoldFragments(str, keyPrefix) {
  const parts = [];
  const re = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let key = 0;
  let match;
  while ((match = re.exec(str)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`${keyPrefix}-b-${key++}`}>{str.slice(lastIndex, match.index)}</span>);
    }
    parts.push(<strong key={`${keyPrefix}-b-${key++}`}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < str.length) {
    parts.push(<span key={`${keyPrefix}-b-${key++}`}>{str.slice(lastIndex)}</span>);
  }
  return parts.length ? parts : [str];
}

/** Detect if a string contains both customer and SHAED signature anchors */
function isSignatureBlock(text) {
  return /\/sig1\//.test(text) && /\/sig2\//.test(text);
}

/** Match date line (e.g. "March 5, 2026") */
function isDateLine(text) {
  return /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}$/.test(text.trim());
}

/** Match second letterhead line (city | website) */
function isLetterheadLocationLine(text) {
  const t = text.trim();
  return (t.includes('Minneapolis') && t.includes('shaed.ai')) || (t.includes('|') && /shaed\.ai/i.test(t));
}

/** Match first letterhead line */
function isLetterheadCompanyLine(text) {
  return /^SHAED\s+Inc\.?$/i.test(text.trim());
}

/** Parse LOI text into blocks: spacer, section, list, paragraph, signature, letterhead */
function parseLOIBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let listBuffer = [];

  function flushList() {
    if (listBuffer.length) {
      blocks.push({ type: 'list', items: listBuffer });
      listBuffer = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed === '') {
      flushList();
      blocks.push({ type: 'spacer' });
      continue;
    }

    if (isAllCapsSection(trimmed)) {
      flushList();
      blocks.push({ type: 'section', text: trimmed });
      continue;
    }

    if (isListItem(raw)) {
      listBuffer.push(stripListPrefix(raw));
      continue;
    }

    if (isSignatureBlock(trimmed)) {
      flushList();
      blocks.push({ type: 'signature', text: trimmed });
      continue;
    }

    // Collect consecutive lines that together form a signature block (e.g. LEFT on one line, RIGHT on next)
    if (/\/sig1\//.test(trimmed)) {
      const sigLines = [trimmed];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== '' && !isSignatureBlock(sigLines.join(' '))) {
        sigLines.push(lines[j].trim());
        j++;
      }
      if (isSignatureBlock(sigLines.join(' '))) {
        flushList();
        blocks.push({ type: 'signature', text: sigLines.join(' ') });
        i = j - 1;
        continue;
      }
    }

    // Letterhead block: SHAED Inc. / Minneapolis, MN | shaed.ai / Date — only at start (after optional spacers)
    const onlySpacersSoFar = blocks.every(b => b.type === 'spacer');
    if (onlySpacersSoFar && isLetterheadCompanyLine(trimmed)) {
      const letterheadLines = [trimmed];
      let j = i + 1;
      // skip blank lines, then collect location line and date line
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j < lines.length && isLetterheadLocationLine(lines[j].trim())) {
        letterheadLines.push(lines[j].trim());
        j++;
        while (j < lines.length && lines[j].trim() === '') j++;
        if (j < lines.length && isDateLine(lines[j])) {
          letterheadLines.push(lines[j].trim());
          j++;
          flushList();
          // remove any leading spacers that are part of "start of document"
          while (blocks.length && blocks[blocks.length - 1].type === 'spacer') blocks.pop();
          blocks.push({ type: 'letterhead', lines: letterheadLines });
          i = j - 1;
          continue;
        }
      }
    }

    flushList();
    blocks.push({ type: 'paragraph', text: trimmed });
  }
  flushList();
  return blocks;
}

/** SHAED signatory display names */
const SHAED_SIGNATORY = {
  ryan: { name: 'Ryan Pritchard', title: 'CEO & Co-Founder' },
  eddie: { name: 'Eddie Schick', title: 'COO & Co-Founder' },
};

/** Strip **bold** and DocuSign anchors for plain PDF text */
function stripForPdf(text) {
  if (!text) return '';
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\/sig1\/|\/sig2\/|\/date1\/|\/date2\//g, '');
}

/** True if this paragraph is redundant with our single signature block (avoids duplication in PDF/preview) */
function isRedundantSignatureParagraph(text, dealData) {
  const t = text.trim();
  const plain = stripForPdf(t);
  if (!plain || !plain.trim()) return true; // only anchors
  const lower = plain.trim().toLowerCase();

  // Exact matches for common signature-area labels
  const redundant = [
    'printed name', 'title', 'date:', 'date', 'signature', 'signature:',
    'counterparty', 'shaed inc.', 'shaed inc'
  ];
  if (redundant.includes(lower)) return true;

  // "Date: Date:" or multiple date labels on one line
  if (/^(date:?\s*)+$/i.test(lower)) return true;

  // Company names (exact or combined on one line)
  const companyName = dealData?.companyName?.trim();
  if (companyName && lower.includes(companyName.toLowerCase()) && lower.includes('shaed')) return true;
  if (companyName && plain.trim() === companyName) return true;
  if (/^SHAED\s+Inc\.?$/i.test(plain.trim())) return true;

  // Signatory names/titles — individual or combined on one line
  const leftName = dealData?.signorName?.trim() || '';
  const leftTitle = dealData?.signorTitle?.trim() || '';
  const leftSignatory = leftName + (leftTitle ? `, ${leftTitle}` : '');
  const ryan = SHAED_SIGNATORY.ryan.name + ', ' + SHAED_SIGNATORY.ryan.title;
  const eddie = SHAED_SIGNATORY.eddie.name + ', ' + SHAED_SIGNATORY.eddie.title;

  // Check if line contains both a left signatory part and a SHAED signatory part (combined line)
  const hasLeftPart = leftName && lower.includes(leftName.toLowerCase());
  const hasRightPart = lower.includes('ryan pritchard') || lower.includes('eddie schick');
  if (hasLeftPart && hasRightPart) return true;

  // Exact matches for individual names/titles
  const exactChecks = [
    leftSignatory, leftName, leftTitle,
    ryan, eddie,
    SHAED_SIGNATORY.ryan.name, SHAED_SIGNATORY.eddie.name,
    SHAED_SIGNATORY.ryan.title, SHAED_SIGNATORY.eddie.title,
  ].filter(Boolean);
  if (exactChecks.some(c => plain.trim() === c)) return true;

  // "Name, Title, Date:" patterns
  if (exactChecks.some(c => plain.trim() === `${c}, Date:` || plain.trim() === `${c}, Date`)) return true;

  // Lines that are mostly signature/date labels with names (catch-all for combined sig lines)
  if (/^(signature|printed name|title|date):?\s/i.test(lower) && lower.length < 100) return true;

  return false;
}

/** Extract signature block labels from raw block text (same logic as SignatureBlock) */
function getSignatureLabels(text) {
  const hasRightPart = /\s*RIGHT\s*—\s*/i.test(text);
  let leftLabel = 'Counterparty';
  let rightLabel = 'SHAED Inc.';
  if (hasRightPart) {
    const leftRight = text.split(/\s*RIGHT\s*—\s*/i);
    const leftPart = leftRight[0] || '';
    const rightPart = leftRight.length > 1 ? leftRight.slice(1).join(' RIGHT — ') : '';
    leftLabel = leftPart.replace(/^LEFT\s*—\s*/i, '').split(/\s*:\s*Signature/i)[0].trim() || leftLabel;
    rightLabel = rightPart.replace(/^RIGHT\s*—\s*/i, '').split(/\s*:\s*Signature/i)[0].trim() || rightLabel;
  }
  return { leftLabel, rightLabel };
}

/** Load logo from public URL and return { dataUrl, widthMm, heightMm } for PDF. Resolves to null if load fails. */
export function loadLogoForPdf() {
  const logoUrl = '/SHAED%20Logo%20-%20Updated.png';
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        const heightMm = 10;
        const widthMm = heightMm * (img.naturalWidth / img.naturalHeight);
        resolve({ dataUrl, widthMm, heightMm });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = logoUrl;
  });
}

/**
 * Build a jsPDF document from LOI text in the same format as the preview.
 * Signature blocks are cleaned (no /sig1/, /date1/, etc.) with two-column layout.
 * Only the first signature block is rendered to avoid duplicates.
 * @param {object} logo - Optional { dataUrl, widthMm, heightMm } to place at top
 */
export function buildLOIPdf(text, dealData, logo = null) {
  const doc = new jsPDF({ unit: 'mm' });
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  const lineHeight = 5.5;
  const spacerHeight = 3;
  const font = 'times';
  const bodySize = 11;
  const sectionSize = 12;
  const teal = [59, 140, 125];

  let y = margin;

  function checkPageBreak(needed = 15) {
    if (y > pageHeight - margin - needed) {
      doc.addPage();
      y = margin;
    }
  }

  // Logo at top
  if (logo?.dataUrl) {
    doc.addImage(logo.dataUrl, 'PNG', margin, y, logo.widthMm, logo.heightMm);
    y += logo.heightMm + 4;
    doc.setDrawColor(...teal);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  }

  const blocks = parseLOIBlocks(text);
  const shaedSignatory = dealData?.shaedSignatory === 'eddie' ? SHAED_SIGNATORY.eddie : SHAED_SIGNATORY.ryan;
  const leftName = dealData?.signorName || 'Printed Name';
  const leftTitle = dealData?.signorTitle || 'Title';
  let signatureRendered = false;

  for (const block of blocks) {
    // Once we've rendered the signature block, skip everything after it
    if (signatureRendered && block.type !== 'signature') continue;

    if (block.type === 'spacer') {
      y += spacerHeight;
      continue;
    }

    if (block.type === 'letterhead') {
      checkPageBreak(25);
      doc.setFont(font, 'bold');
      doc.setFontSize(bodySize);
      doc.setTextColor(0, 0, 0);
      if (block.lines[0]) {
        doc.text(stripForPdf(block.lines[0]), margin, y);
        y += lineHeight;
      }
      doc.setFont(font, 'normal');
      for (let i = 1; i < block.lines.length; i++) {
        doc.text(stripForPdf(block.lines[i]), margin, y);
        y += lineHeight;
      }
      y += lineHeight;
      continue;
    }

    if (block.type === 'section') {
      // Skip redundant section headers that duplicate our signature block labels
      const sectionText = stripForPdf(block.text).trim();
      const companyUpper = dealData?.companyName?.trim().toUpperCase();
      if (companyUpper && sectionText === companyUpper) continue;
      if (/^SHAED\s+INC\.?$/i.test(sectionText)) continue;
      if (/^COUNTERPARTY$/i.test(sectionText)) continue;
      checkPageBreak(20);
      doc.setFont(font, 'bold');
      doc.setFontSize(sectionSize);
      doc.setTextColor(...teal);
      doc.text(sectionText, margin, y);
      y += 6;
      doc.setDrawColor(...teal);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageWidth - margin, y);
      y += 4;
      doc.setFont(font, 'normal');
      doc.setFontSize(bodySize);
      doc.setTextColor(0, 0, 0);
      y += lineHeight;
      continue;
    }

    if (block.type === 'paragraph') {
      if (isRedundantSignatureParagraph(block.text, dealData)) continue;
      const plain = stripForPdf(block.text);
      const lines = doc.splitTextToSize(plain, maxWidth);
      for (const line of lines) {
        checkPageBreak();
        doc.setFont(font, 'normal');
        doc.setFontSize(bodySize);
        doc.setTextColor(0, 0, 0);
        doc.text(line, margin, y);
        y += lineHeight;
      }
      y += lineHeight * 0.5;
      continue;
    }

    if (block.type === 'list') {
      const items = block.items.filter((item) => !isRedundantSignatureParagraph(item, dealData));
      if (items.length === 0) continue;
      doc.setFont(font, 'normal');
      doc.setFontSize(bodySize);
      doc.setTextColor(0, 0, 0);
      for (const item of items) {
        const plain = stripForPdf(item);
        const lines = doc.splitTextToSize(plain, maxWidth - 6);
        checkPageBreak();
        doc.text('•', margin, y);
        doc.text(lines[0] || '', margin + 6, y);
        y += lineHeight;
        for (let i = 1; i < lines.length; i++) {
          checkPageBreak();
          doc.text(lines[i], margin + 6, y);
          y += lineHeight;
        }
      }
      y += lineHeight * 0.5;
      continue;
    }

    if (block.type === 'signature') {
      if (signatureRendered) continue;
      signatureRendered = true;
      checkPageBreak(45);
      const { leftLabel, rightLabel } = getSignatureLabels(block.text);
      const colWidth = (pageWidth - margin * 2 - 20) / 2;
      const leftX = margin;
      const rightX = margin + colWidth + 20;
      const metaSize = 9;
      const sigStartY = y;

      // Left column
      doc.setFont(font, 'bold');
      doc.setFontSize(bodySize);
      doc.setTextColor(0, 0, 0);
      doc.text(leftLabel, leftX, y);
      y += 5;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.2);
      doc.line(leftX, y, leftX + colWidth, y);
      y += 6;
      doc.setFont(font, 'normal');
      doc.setFontSize(metaSize);
      doc.text(leftName, leftX, y);
      y += 4;
      doc.text(leftTitle, leftX, y);
      y += 5;
      doc.text('Date:', leftX, y);
      y += 4;
      const dateLineLength = 45;
      doc.line(leftX, y, leftX + dateLineLength, y);
      const leftBottom = y + 6;

      // Right column (same vertical layout, starting at sigStartY)
      y = sigStartY;
      doc.setFont(font, 'bold');
      doc.setFontSize(bodySize);
      doc.text(rightLabel, rightX, y);
      y += 5;
      doc.line(rightX + colWidth - 80, y, rightX + colWidth, y);
      y += 6;
      doc.setFont(font, 'normal');
      doc.setFontSize(metaSize);
      doc.text(shaedSignatory.name, rightX, y);
      y += 4;
      doc.text(shaedSignatory.title, rightX, y);
      y += 5;
      doc.text('Date:', rightX, y);
      y += 4;
      doc.line(rightX + colWidth - dateLineLength, y, rightX + colWidth, y);
      y = Math.max(leftBottom, y + 6);
      continue;
    }
  }

  return doc;
}

/** Two-column signature block: customer left, SHAED right, with lines for DocuSign */
function SignatureBlock({ text, dealData }) {
  const hasRightPart = /\s*RIGHT\s*—\s*/i.test(text);
  let leftLabel = 'Counterparty';
  let rightLabel = 'SHAED Inc.';

  if (hasRightPart) {
    const leftRight = text.split(/\s*RIGHT\s*—\s*/i);
    const leftPart = leftRight[0] || '';
    const rightPart = leftRight.length > 1 ? leftRight.slice(1).join(' RIGHT — ') : '';
    leftLabel = leftPart.replace(/^LEFT\s*—\s*/i, '').split(/\s*:\s*Signature/i)[0].trim() || leftLabel;
    rightLabel = rightPart.replace(/^RIGHT\s*—\s*/i, '').split(/\s*:\s*Signature/i)[0].trim() || rightLabel;
  }

  const shaedSignatory = dealData?.shaedSignatory === 'eddie' ? SHAED_SIGNATORY.eddie : SHAED_SIGNATORY.ryan;
  const leftName = dealData?.signorName || 'Printed Name';
  const leftTitle = dealData?.signorTitle || 'Title';
  const rightName = shaedSignatory.name;
  const rightTitle = shaedSignatory.title;

  return (
    <div className="loi-signature-block">
      <div className="loi-sig-col loi-sig-col-left">
        <div className="loi-sig-label">{leftLabel}</div>
        <div className="loi-sig-line">
          <span className="loi-docusign-anchor" aria-hidden="true">/sig1/</span>
        </div>
        <div className="loi-sig-meta">{leftName}</div>
        <div className="loi-sig-meta">{leftTitle}</div>
        <div className="loi-sig-meta loi-sig-date-label">Date</div>
        <div className="loi-sig-line loi-sig-date-line">
          <span className="loi-docusign-anchor" aria-hidden="true">/date1/</span>
        </div>
      </div>
      <div className="loi-sig-col loi-sig-col-right">
        <div className="loi-sig-label">{rightLabel}</div>
        <div className="loi-sig-line">
          <span className="loi-docusign-anchor" aria-hidden="true">/sig2/</span>
        </div>
        <div className="loi-sig-meta">{rightName}</div>
        <div className="loi-sig-meta">{rightTitle}</div>
        <div className="loi-sig-meta loi-sig-date-label">Date</div>
        <div className="loi-sig-line loi-sig-date-line">
          <span className="loi-docusign-anchor" aria-hidden="true">/date2/</span>
        </div>
      </div>
    </div>
  );
}

function RenderedLOI({ text, dealData }) {
  const blocks = useMemo(() => parseLOIBlocks(text), [text]);
  let signatureRendered = false;
  return (
    <div className="loi-document-body">
      {blocks.map((block, i) => {
        // Once signature is rendered, skip everything after it
        if (signatureRendered && block.type !== 'signature') return null;

        if (block.type === 'spacer') {
          return <div key={i} className="loi-paragraph-spacer" />;
        }
        if (block.type === 'signature') {
          if (signatureRendered) return null;
          signatureRendered = true;
          return <SignatureBlock key={i} text={block.text} dealData={dealData} />;
        }
        if (block.type === 'section') {
          const sectionText = (block.text || '').replace(/\*\*([^*]+)\*\*/g, '$1').trim();
          const companyUpper = dealData?.companyName?.trim().toUpperCase();
          if (companyUpper && sectionText === companyUpper) return null;
          if (/^SHAED\s+INC\.?$/i.test(sectionText)) return null;
          if (/^COUNTERPARTY$/i.test(sectionText)) return null;
          return (
            <div key={i} className="loi-section-header">
              {renderInline(block.text, `s-${i}`)}
            </div>
          );
        }
        if (block.type === 'list') {
          const items = block.items.filter((item) => !isRedundantSignatureParagraph(item, dealData));
          if (items.length === 0) return null;
          return (
            <ul key={i} className="loi-list-wrap">
              {items.map((item, j) => (
                <li key={j} className="loi-list-item">
                  {renderInline(item, `l-${i}-${j}`)}
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === 'paragraph') {
          if (isRedundantSignatureParagraph(block.text, dealData)) return null;
          return (
            <p key={i} className="loi-body-paragraph">
              {renderInline(block.text, `p-${i}`)}
            </p>
          );
        }
        if (block.type === 'letterhead') {
          return (
            <div key={i} className="loi-letterhead-block">
              {block.lines.map((line, j) => (
                <div key={j} className="loi-letterhead-line">
                  {renderInline(line, `letter-${i}-${j}`)}
                </div>
              ))}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

export default function LOIPreview({ loiText, dealData, onBack, onRegenerate, onSendForSignature, isRegenerating }) {
  const [revisionHistory, setRevisionHistory] = useState([
    { version: 1, text: loiText }
  ]);
  const [currentVersion, setCurrentVersion] = useState(1);
  const [isEditing, setIsEditing] = useState(false);
  const [editInstruction, setEditInstruction] = useState('');
  const [isRevising, setIsRevising] = useState(false);
  const [revisionError, setRevisionError] = useState('');

  const currentText = revisionHistory.find(r => r.version === currentVersion)?.text || loiText;
  const charCount = currentText.length;

  function handleTextEdit(e) {
    const newText = e.target.value;
    setRevisionHistory(prev =>
      prev.map(r => r.version === currentVersion ? { ...r, text: newText } : r)
    );
  }

  function handleSend() {
    onSendForSignature(currentText);
  }

  function handleRegenerate() {
    onRegenerate();
  }

  async function handleRevise() {
    if (!editInstruction.trim()) return;

    setIsRevising(true);
    setRevisionError('');

    try {
      const res = await fetch('/api/edit-loi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          existingLOI: currentText,
          editInstruction: editInstruction.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to revise LOI');
      }

      const newVersion = revisionHistory.length + 1;
      setRevisionHistory(prev => [...prev, { version: newVersion, text: data.loi }]);
      setCurrentVersion(newVersion);
      setEditInstruction('');
    } catch (err) {
      setRevisionError(err.message);
    } finally {
      setIsRevising(false);
    }
  }

  // Build module chips from deal data
  const moduleLabels = { shop: 'Shop', track: 'Track', document: 'Document' };

  return (
    <div className="max-w-6xl mx-auto min-w-0">
      {/* Deal summary chips */}
      <div className="flex flex-wrap gap-2 mb-3 sm:mb-4">
        <span className="px-3 py-1 text-xs font-medium rounded-full bg-teal-primary/10 text-teal-dark">
          {dealData.companyName}
        </span>
        {dealData.modules?.map((m, i) => {
          const key = Object.keys(moduleLabels).find(k =>
            m.toLowerCase().includes(k)
          );
          return (
            <span key={i} className="px-3 py-1 text-xs font-medium rounded-full bg-navy/10 text-navy">
              {key ? moduleLabels[key] : m.split('—')[0].trim()}
            </span>
          );
        })}
        {dealData.subscriptionFee && (
          <span className="px-3 py-1 text-xs font-medium rounded-full bg-neutral-100 text-neutral-700">
            {dealData.subscriptionFee}/mo
          </span>
        )}
        {dealData.implementation === 'yes' && dealData.implementationFee && (
          <span className="px-3 py-1 text-xs font-medium rounded-full bg-neutral-100 text-neutral-700">
            {dealData.implementationFee} impl.
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* LOI Preview — left 2/3 */}
        <div className="lg:col-span-2 space-y-4 min-w-0">
          <div className="card p-4 sm:p-6 lg:p-8">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                <h3 className="text-sm font-semibold text-neutral-900">Letter of Intent</h3>
                {/* Version chips */}
                {revisionHistory.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1">
                    {revisionHistory.map(r => (
                      <button
                        key={r.version}
                        onClick={() => setCurrentVersion(r.version)}
                        className={`px-2 py-1 text-xs rounded-full transition-colors touch-manipulation ${
                          r.version === currentVersion
                            ? 'bg-teal-primary text-white font-semibold'
                            : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                        }`}
                      >
                        v{r.version}{r.version === revisionHistory.length ? ' (current)' : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-neutral-700">{charCount.toLocaleString()} chars</span>
                <button
                  type="button"
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-xs px-2 py-1.5 sm:py-1 rounded border border-neutral-200 text-neutral-700 hover:bg-neutral-50 touch-manipulation min-h-[36px] sm:min-h-0"
                >
                  {isEditing ? 'Preview' : 'Edit'}
                </button>
              </div>
            </div>

            {isEditing ? (
              <textarea
                value={currentText}
                onChange={handleTextEdit}
                className="w-full min-h-[320px] sm:min-h-[480px] lg:min-h-[600px] font-mono text-sm leading-relaxed p-3 sm:p-4 border border-neutral-200 rounded-lg focus:border-teal-primary focus:ring-1 focus:ring-teal-primary/20 outline-none resize-y"
                style={{ fontFamily: "'Courier New', monospace", fontSize: '0.8125rem' }}
              />
            ) : (
              <div className="loi-document-page min-h-[320px] sm:min-h-[480px] lg:min-h-[600px] rounded-lg overflow-hidden">
                <header className="loi-letterhead">
                  <LOILetterheadLogo />
                </header>
                <div className="loi-letterhead-divider" />
                <RenderedLOI text={currentText} dealData={dealData} />
              </div>
            )}
          </div>

          {/* AI Edit Panel */}
          <div
            className="rounded-xl p-4 sm:p-5 border-l-4"
            style={{ background: '#E8F5F3', borderLeftColor: 'var(--teal-primary)' }}
          >
            <h4 className="text-sm font-semibold text-neutral-900 mb-3">Request a Change</h4>
            <textarea
              value={editInstruction}
              onChange={(e) => setEditInstruction(e.target.value)}
              rows={3}
              className="w-full border border-neutral-200 rounded-lg p-3 text-sm resize-none outline-none focus:border-teal-primary focus:ring-1 focus:ring-teal-primary/20 bg-white min-h-[80px]"
              placeholder={'e.g. "Change the implementation fee to $30,000"\n"Add a 90-day pilot period before subscription"\n"Remove the confidentiality section"'}
              disabled={isRevising}
            />

            {revisionError && (
              <p className="text-error text-xs mt-2">{revisionError}</p>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-3">
              <button
                onClick={handleRevise}
                disabled={isRevising || !editInstruction.trim()}
                className="btn-primary py-2.5 sm:py-2 px-5 text-sm flex items-center justify-center gap-2 min-h-[44px] sm:min-h-0"
              >
                {isRevising ? (
                  <>
                    <span className="spinner !w-4 !h-4 !border-2 !border-white/30 !border-t-white"></span>
                    Applying changes...
                  </>
                ) : (
                  'Revise with AI →'
                )}
              </button>
              {revisionHistory.length > 1 && (
                <span className="text-xs text-neutral-700">
                  {revisionHistory.length} version{revisionHistory.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right pane — controls */}
        <div className="space-y-4 min-w-0">
          <div className="card p-4">
            <h4 className="text-sm font-semibold text-neutral-900 mb-3">Actions</h4>
            <div className="space-y-2">
              <button
                onClick={handleSend}
                className="btn-primary w-full py-2.5 min-h-[44px] sm:min-h-0"
              >
                Send for Signature →
              </button>
              <button
                onClick={handleRegenerate}
                disabled={isRegenerating}
                className="btn-secondary w-full py-2.5 min-h-[44px] sm:min-h-0 flex items-center justify-center gap-2"
              >
                {isRegenerating ? (
                  <>
                    <span className="spinner !w-4 !h-4 !border-2"></span>
                    Regenerating...
                  </>
                ) : (
                  'Regenerate'
                )}
              </button>
              <button
                onClick={onBack}
                className="btn-secondary w-full py-2.5 min-h-[44px] sm:min-h-0"
              >
                ← Back to Form
              </button>
            </div>
          </div>

          <div className="card p-4">
            <h4 className="text-sm font-semibold text-neutral-900 mb-3">Quick Actions</h4>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  const blob = new Blob([currentText], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `SHAED_LOI_${dealData.companyName?.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="text-sm text-teal-primary hover:text-teal-dark font-medium text-left"
              >
                Download LOI (.txt)
              </button>
              <button
                onClick={async () => {
                  const logo = await loadLogoForPdf();
                  const doc = buildLOIPdf(currentText, dealData, logo);
                  doc.save(`SHAED_LOI_${dealData.companyName?.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
                }}
                className="text-sm text-teal-primary hover:text-teal-dark font-medium text-left"
              >
                Download LOI (.pdf)
              </button>
            </div>
          </div>

          <div className="card p-4">
            <h4 className="text-sm font-semibold text-neutral-900 mb-2">Tips</h4>
            <ul className="text-xs text-neutral-700 space-y-1">
              <li>Use "Request a Change" to ask AI for specific edits</li>
              <li>Click version chips to compare or revert</li>
              <li>Click "Edit" for direct text changes</li>
              <li>Anchor tags like /sig1/ are for DocuSign — keep them</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
