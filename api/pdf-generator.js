import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Colors ──
const TEAL = rgb(59 / 255, 140 / 255, 125 / 255);
const GREY = rgb(95 / 255, 99 / 255, 104 / 255);
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);

// ── Page layout ──
const PAGE_WIDTH = PageSizes.Letter[0];   // 612pt
const PAGE_HEIGHT = PageSizes.Letter[1];  // 792pt
const MARGIN = 72;                        // 1 inch
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN; // 468pt

// ── Typography ──
const BODY_SIZE = 11;
const HEADER_SIZE = 13;
const LINE_HEIGHT = BODY_SIZE * 1.6;       // 17.6pt
const PARAGRAPH_SPACING = 12;

// ── Logo loader ──
function loadLogoPng() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const candidates = [
    path.resolve(__dirname, '../public/SHAED Logo - Updated.png'),
    path.resolve(process.cwd(), 'public/SHAED Logo - Updated.png'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p);
    } catch { /* skip */ }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
//  TEXT PARSING — matches the frontend LOIPreview parser logic
// ═══════════════════════════════════════════════════════════════

function stripBold(text) {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1');
}

/** Strip markdown heading prefix (## , ### , etc.) */
function stripMarkdownHeader(text) {
  return text.replace(/^#{1,6}\s+/, '');
}

/**
 * Sanitize text for WinAnsi encoding (standard PDF fonts only support Latin-1).
 * Replaces smart quotes, em/en dashes, ellipsis, and other common Unicode
 * characters that Claude may output with their ASCII equivalents.
 */
function sanitizeForWinAnsi(text) {
  return text
    .replace(/[\u2018\u2019\u201A]/g, "'")   // smart single quotes
    .replace(/[\u201C\u201D\u201E]/g, '"')   // smart double quotes
    .replace(/\u2013/g, '-')                  // en dash
    .replace(/\u2014/g, '--')                 // em dash
    .replace(/\u2026/g, '...')                // ellipsis
    .replace(/\u00A0/g, ' ')                  // non-breaking space
    .replace(/\u2022/g, '-')                  // bullet (for inline text only)
    .replace(/\u00B7/g, '-')                  // middle dot
    .replace(/\u2010|\u2011/g, '-')           // hyphen variants
    .replace(/\u2012/g, '-')                  // figure dash
    .replace(/\u00AD/g, '')                   // soft hyphen
    // Remove any remaining characters outside WinAnsi range (keep basic Latin + Latin-1 Supplement)
    .replace(/[^\x00-\xFF]/g, '');
}

function isAllCapsSection(line) {
  const t = stripMarkdownHeader(stripBold(line.trim()));
  if (t.length < 2) return false;
  if (!/[A-Z]/.test(t)) return false;
  return t === t.toUpperCase();
}

function isListItem(line) {
  return /^\s*[•\-]\s/.test(line);
}

function isSignatureBlock(text) {
  return /\/sig1\//.test(text) && /\/sig2\//.test(text);
}

function isLetterheadCompanyLine(text) {
  const stripped = stripBold(text.trim());
  return /^SHAED\s+Inc\.?$/i.test(stripped);
}

function isLetterheadLocationLine(text) {
  const t = text.trim();
  return (t.includes('Minneapolis') && t.includes('shaed.ai'))
      || (t.includes('|') && /shaed\.ai/i.test(t));
}

function isDateLine(text) {
  return /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}$/.test(text.trim());
}

function parseLOIText(text) {
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

    if (trimmed === '') { flushList(); blocks.push({ type: 'spacer' }); continue; }

    if (isAllCapsSection(trimmed) && !isSignatureBlock(trimmed)) {
      flushList();
      blocks.push({ type: 'section', text: trimmed });
      continue;
    }

    if (isListItem(raw)) {
      listBuffer.push(trimmed.replace(/^[•\-]\s*/, ''));
      continue;
    }

    if (isSignatureBlock(trimmed)) {
      flushList();
      blocks.push({ type: 'signature', text: trimmed });
      continue;
    }

    // Multi-line signature block
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

    // Letterhead at start of document
    const onlySpacersSoFar = blocks.every(b => b.type === 'spacer');
    if (onlySpacersSoFar && isLetterheadCompanyLine(trimmed)) {
      const letterheadLines = [trimmed];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j < lines.length && isLetterheadLocationLine(lines[j].trim())) {
        letterheadLines.push(lines[j].trim());
        j++;
        while (j < lines.length && lines[j].trim() === '') j++;
        if (j < lines.length && isDateLine(lines[j])) {
          letterheadLines.push(lines[j].trim());
          j++;
          // Check for optional title line (e.g. "Non-Binding Letter of Intent")
          while (j < lines.length && lines[j].trim() === '') j++;
          if (j < lines.length && /letter of intent/i.test(lines[j].trim()) && !isAllCapsSection(lines[j].trim())) {
            letterheadLines.push(lines[j].trim());
            j++;
          }
          flushList();
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

// ═══════════════════════════════════════════════════════════════
//  INLINE FORMATTING — **bold** detection
// ═══════════════════════════════════════════════════════════════

function parseInlineFormatting(text) {
  const segments = [];
  const re = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), bold: false });
    }
    segments.push({ text: match[1], bold: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), bold: false });
  }
  return segments;
}

// ═══════════════════════════════════════════════════════════════
//  DRAWING HELPERS
// ═══════════════════════════════════════════════════════════════

function checkPageBreak(ctx, needed = 20) {
  if (ctx.y - needed < MARGIN) {
    ctx.page = ctx.doc.addPage(PageSizes.Letter);
    ctx.y = PAGE_HEIGHT - MARGIN;
  }
}

/**
 * Draw text with inline **bold** formatting and automatic word-wrap.
 * DocuSign anchor strings are stripped before rendering.
 */
function drawRichText(ctx, text, x, maxWidth, fontSize, color = BLACK) {
  const cleanText = sanitizeForWinAnsi(text.replace(/\/sig1\/|\/sig2\/|\/date1\/|\/date2\/|\/name1\//g, ''));
  const segments = parseInlineFormatting(cleanText);

  // Build word list with bold flags
  const words = [];
  for (const seg of segments) {
    for (const w of seg.text.split(/\s+/).filter(Boolean)) {
      words.push({ text: w, bold: seg.bold });
    }
  }
  if (words.length === 0) return;

  const { regular, bold } = ctx.fonts;
  const spaceWidth = regular.widthOfTextAtSize(' ', fontSize);

  // Wrap into lines
  const lines = [];
  let line = [];
  let lineWidth = 0;

  for (const word of words) {
    const font = word.bold ? bold : regular;
    const wordWidth = font.widthOfTextAtSize(word.text, fontSize);
    const gap = line.length > 0 ? spaceWidth : 0;

    if (lineWidth + gap + wordWidth > maxWidth && line.length > 0) {
      lines.push(line);
      line = [word];
      lineWidth = wordWidth;
    } else {
      line.push(word);
      lineWidth += gap + wordWidth;
    }
  }
  if (line.length > 0) lines.push(line);

  const lh = fontSize * 1.6;

  for (const lineWords of lines) {
    checkPageBreak(ctx, lh);
    let xPos = x;
    for (let i = 0; i < lineWords.length; i++) {
      if (i > 0) xPos += spaceWidth;
      const word = lineWords[i];
      const font = word.bold ? bold : regular;
      ctx.page.drawText(word.text, { x: xPos, y: ctx.y, size: fontSize, font, color });
      xPos += font.widthOfTextAtSize(word.text, fontSize);
    }
    ctx.y -= lh;
  }
}

function wrapPlainText(text, font, fontSize, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const test = currentLine ? `${currentLine} ${word}` : word;
    if (font.widthOfTextAtSize(test, fontSize) > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length ? lines : [''];
}

// ═══════════════════════════════════════════════════════════════
//  SIGNATURE HELPERS (match frontend logic)
// ═══════════════════════════════════════════════════════════════

function getSignatureLabels(text) {
  let leftLabel = 'Counterparty';
  let rightLabel = 'SHAED Inc.';
  if (/\s*RIGHT\s*—\s*/i.test(text)) {
    const parts = text.split(/\s*RIGHT\s*—\s*/i);
    const leftPart = parts[0] || '';
    const rightPart = parts.length > 1 ? parts.slice(1).join(' RIGHT — ') : '';
    leftLabel = leftPart.replace(/^LEFT\s*—\s*/i, '').split(/\s*:\s*Signature/i)[0].trim() || leftLabel;
    rightLabel = rightPart.replace(/^RIGHT\s*—\s*/i, '').split(/\s*:\s*Signature/i)[0].replace(/\s*\(.*?\)\s*$/, '').trim() || rightLabel;
  }
  return { leftLabel, rightLabel };
}

function isRedundantSignatureParagraph(text, dealData) {
  if (!text || !text.trim()) return true;
  const plain = stripBold(text).replace(/\/sig1\/|\/sig2\/|\/date1\/|\/date2\/|\/name1\//g, '').trim();
  if (!plain) return true;
  const lower = plain.toLowerCase();

  const redundant = [
    'printed name', 'title', 'date:', 'date', 'signature', 'signature:',
    'counterparty', 'shaed inc.', 'shaed inc'
  ];
  if (redundant.includes(lower)) return true;
  if (/^(date:?\s*)+$/i.test(lower)) return true;

  const companyName = dealData?.companyName?.trim();
  // Only filter short signature-block-style lines, not full body paragraphs
  if (companyName && plain.length < 150 && lower.includes(companyName.toLowerCase()) && lower.includes('shaed')) return true;
  if (companyName && plain === companyName) return true;
  if (/^SHAED\s+Inc\.?$/i.test(plain)) return true;

  // Signatory names — only filter short lines
  const leftName = dealData?.signorName?.trim() || '';
  const hasLeftPart = leftName && lower.includes(leftName.toLowerCase());
  const hasRightPart = lower.includes('ryan pritchard') || lower.includes('eddie schick');
  if (hasLeftPart && hasRightPart && plain.length < 150) return true;

  const exactChecks = [
    leftName,
    dealData?.signorTitle?.trim(),
    'Ryan Pritchard', 'Eddie Schick',
    'CEO & Co-Founder', 'CFO & Co-Founder',
    'Ryan Pritchard, CEO & Co-Founder',
    'Eddie Schick, CFO & Co-Founder',
  ].filter(Boolean);
  if (exactChecks.some(c => plain === c)) return true;
  if (exactChecks.some(c => plain === `${c}, Date:` || plain === `${c}, Date`)) return true;
  if (/^(signature|printed name|title|date):?\s/i.test(lower) && lower.length < 100) return true;

  return false;
}

// ═══════════════════════════════════════════════════════════════
//  MAIN PDF GENERATOR
// ═══════════════════════════════════════════════════════════════

export async function generateLOIPdf(loiText, dealData) {
  const doc = await PDFDocument.create();

  // Embed fonts
  const timesRoman   = await doc.embedFont(StandardFonts.TimesRoman);
  const timesBold    = await doc.embedFont(StandardFonts.TimesRomanBold);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const fonts = { regular: timesRoman, bold: timesBold, headerBold: helveticaBold };

  // Embed logo
  let logoImage = null;
  try {
    const logoBytes = loadLogoPng();
    if (logoBytes) logoImage = await doc.embedPng(logoBytes);
  } catch (e) {
    console.warn('Could not load SHAED logo for PDF:', e.message);
  }

  // Drawing context
  const ctx = {
    doc,
    page: doc.addPage(PageSizes.Letter),
    y: PAGE_HEIGHT - MARGIN,
    fonts,
  };

  // ── LETTERHEAD ──
  if (logoImage) {
    const logoH = 30;
    const logoW = logoH * (logoImage.width / logoImage.height);
    ctx.page.drawImage(logoImage, { x: MARGIN, y: ctx.y - logoH, width: logoW, height: logoH });
    ctx.y -= logoH + 8;
  }

  // Location line
  ctx.page.drawText('Minneapolis, MN | shaed.ai', {
    x: MARGIN, y: ctx.y, size: 10, font: timesRoman, color: GREY,
  });
  ctx.y -= 16;

  // Teal horizontal rule
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
    thickness: 1,
    color: TEAL,
  });
  ctx.y -= 24;

  // ── RENDER BLOCKS ──
  const blocks = parseLOIText(loiText);
  const shaedSignatory = dealData?.shaedSignatory === 'eddie'
    ? { name: 'Eddie Schick', title: 'CFO & Co-Founder' }
    : { name: 'Ryan Pritchard', title: 'CEO & Co-Founder' };

  let signatureRendered = false;

  for (const block of blocks) {
    if (signatureRendered && block.type !== 'signature') continue;

    // ─── SPACER ───
    if (block.type === 'spacer') {
      ctx.y -= PARAGRAPH_SPACING;
      continue;
    }

    // ─── LETTERHEAD (text-based) — draw date + hardcoded title ───
    if (block.type === 'letterhead') {
      // Title first
      checkPageBreak(ctx, LINE_HEIGHT + 30);
      ctx.page.drawText('Non-Binding Letter of Intent', {
        x: MARGIN, y: ctx.y, size: 15, font: helveticaBold, color: BLACK,
      });
      ctx.y -= 30;

      // Date below the title
      for (const line of block.lines) {
        if (isDateLine(line)) {
          ctx.page.drawText(sanitizeForWinAnsi(line.trim()), {
            x: MARGIN, y: ctx.y, size: BODY_SIZE, font: timesRoman, color: BLACK,
          });
          ctx.y -= LINE_HEIGHT + 16;
        }
        // Skip any title line Claude may have output (avoid duplication)
      }
      ctx.y -= PARAGRAPH_SPACING;
      continue;
    }

    // ─── SECTION HEADER (ALL CAPS) ───
    if (block.type === 'section') {
      const sectionText = sanitizeForWinAnsi(stripMarkdownHeader(stripBold(block.text)).trim());
      const companyUpper = dealData?.companyName?.trim().toUpperCase();
      if (companyUpper && sectionText === companyUpper) continue;
      if (/^SHAED\s+INC\.?$/i.test(sectionText)) continue;
      if (/^COUNTERPARTY$/i.test(sectionText)) continue;

      checkPageBreak(ctx, 30);
      ctx.y -= 4;

      // Teal header text
      ctx.page.drawText(sectionText, {
        x: MARGIN, y: ctx.y, size: HEADER_SIZE, font: helveticaBold, color: TEAL,
      });
      ctx.y -= HEADER_SIZE + 4;

      // Thin teal underline
      ctx.page.drawLine({
        start: { x: MARGIN, y: ctx.y },
        end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
        thickness: 0.5,
        color: TEAL,
      });
      ctx.y -= LINE_HEIGHT;
      continue;
    }

    // ─── PARAGRAPH ───
    if (block.type === 'paragraph') {
      if (isRedundantSignatureParagraph(block.text, dealData)) continue;

      checkPageBreak(ctx, LINE_HEIGHT * 2);
      drawRichText(ctx, block.text, MARGIN, CONTENT_WIDTH, BODY_SIZE);
      ctx.y -= PARAGRAPH_SPACING * 0.5;
      continue;
    }

    // ─── LIST ───
    if (block.type === 'list') {
      for (const item of block.items) {
        if (isRedundantSignatureParagraph(item, dealData)) continue;

        checkPageBreak(ctx, LINE_HEIGHT * 2);

        // Bullet character
        ctx.page.drawText('\u2022', {
          x: MARGIN, y: ctx.y, size: BODY_SIZE, font: timesRoman, color: BLACK,
        });

        // Item text indented
        drawRichText(ctx, item, MARGIN + 12, CONTENT_WIDTH - 12, BODY_SIZE);
      }
      ctx.y -= PARAGRAPH_SPACING * 0.5;
      continue;
    }

    // ─── SIGNATURE BLOCK ───
    if (block.type === 'signature') {
      if (signatureRendered) continue;
      signatureRendered = true;

      checkPageBreak(ctx, 160);

      const rawLabels = getSignatureLabels(block.text);
      const leftLabel = sanitizeForWinAnsi(rawLabels.leftLabel);
      const rightLabel = sanitizeForWinAnsi(rawLabels.rightLabel);
      const colWidth = (CONTENT_WIDTH - 30) / 2;
      const leftX = MARGIN;
      const rightX = MARGIN + colWidth + 30;
      const sigLineLen = colWidth - 10;
      const metaSize = 9;
      const metaLH = 12;

      const leftName  = sanitizeForWinAnsi(dealData?.signorName  || 'Printed Name');
      const leftTitle = sanitizeForWinAnsi(dealData?.signorTitle  || 'Title');

      // "SIGNATURES" section header
      ctx.y -= 4;
      ctx.page.drawText('SIGNATURES', {
        x: MARGIN, y: ctx.y, size: HEADER_SIZE, font: helveticaBold, color: TEAL,
      });
      ctx.y -= HEADER_SIZE + 4;
      ctx.page.drawLine({
        start: { x: MARGIN, y: ctx.y },
        end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
        thickness: 0.75, color: TEAL,
      });
      ctx.y -= 20;

      const sigStartY = ctx.y;

      // ── LEFT COLUMN (counterparty) ──
      ctx.page.drawText(leftLabel, {
        x: leftX, y: ctx.y, size: BODY_SIZE, font: timesBold, color: BLACK,
      });
      ctx.y -= 40;

      // Signature line
      ctx.page.drawLine({
        start: { x: leftX, y: ctx.y }, end: { x: leftX + sigLineLen, y: ctx.y },
        thickness: 0.5, color: BLACK,
      });
      // Invisible DocuSign anchor — /sig1/
      ctx.page.drawText('/sig1/', {
        x: leftX, y: ctx.y + 2, size: 1, font: timesRoman, color: WHITE,
      });
      ctx.y -= 14;

      // Printed name
      ctx.page.drawText(leftName, {
        x: leftX, y: ctx.y, size: metaSize, font: timesRoman, color: BLACK,
      });
      // Invisible DocuSign anchor — /name1/
      ctx.page.drawText('/name1/', {
        x: leftX + timesRoman.widthOfTextAtSize(leftName, metaSize) + 4,
        y: ctx.y, size: 1, font: timesRoman, color: WHITE,
      });
      ctx.y -= metaLH;

      // Title
      ctx.page.drawText(leftTitle, {
        x: leftX, y: ctx.y, size: metaSize, font: timesRoman, color: BLACK,
      });
      ctx.y -= 14;

      // Date
      ctx.page.drawText('Date: ___________', {
        x: leftX, y: ctx.y, size: metaSize, font: timesRoman, color: BLACK,
      });
      // Invisible DocuSign anchor — /date1/
      ctx.page.drawText('/date1/', {
        x: leftX + 30, y: ctx.y + 2, size: 1, font: timesRoman, color: WHITE,
      });
      const leftBottom = ctx.y;

      // ── RIGHT COLUMN (SHAED) ──
      ctx.y = sigStartY;

      ctx.page.drawText(rightLabel, {
        x: rightX, y: ctx.y, size: BODY_SIZE, font: timesBold, color: BLACK,
      });
      ctx.y -= 40;

      ctx.page.drawLine({
        start: { x: rightX, y: ctx.y }, end: { x: rightX + sigLineLen, y: ctx.y },
        thickness: 0.5, color: BLACK,
      });
      ctx.page.drawText('/sig2/', {
        x: rightX, y: ctx.y + 2, size: 1, font: timesRoman, color: WHITE,
      });
      ctx.y -= 14;

      ctx.page.drawText(shaedSignatory.name, {
        x: rightX, y: ctx.y, size: metaSize, font: timesRoman, color: BLACK,
      });
      ctx.y -= metaLH;

      ctx.page.drawText(shaedSignatory.title, {
        x: rightX, y: ctx.y, size: metaSize, font: timesRoman, color: BLACK,
      });
      ctx.y -= 14;

      ctx.page.drawText('Date: ___________', {
        x: rightX, y: ctx.y, size: metaSize, font: timesRoman, color: BLACK,
      });
      ctx.page.drawText('/date2/', {
        x: rightX + 30, y: ctx.y + 2, size: 1, font: timesRoman, color: WHITE,
      });

      ctx.y = Math.min(leftBottom, ctx.y) - 20;
      continue;
    }
  }

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes).toString('base64');
}
