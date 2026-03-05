import { useState, useMemo } from 'react';

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
  const leftName = 'Printed Name';
  const leftTitle = 'Title';
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
  return (
    <div className="loi-document-body">
      {blocks.map((block, i) => {
        if (block.type === 'spacer') {
          return <div key={i} className="loi-paragraph-spacer" />;
        }
        if (block.type === 'section') {
          return (
            <div key={i} className="loi-section-header">
              {renderInline(block.text, `s-${i}`)}
            </div>
          );
        }
        if (block.type === 'list') {
          return (
            <ul key={i} className="loi-list-wrap">
              {block.items.map((item, j) => (
                <li key={j} className="loi-list-item">
                  {renderInline(item, `l-${i}-${j}`)}
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === 'signature') {
          return <SignatureBlock key={i} text={block.text} dealData={dealData} />;
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
        return (
          <p key={i} className="loi-body-paragraph">
            {renderInline(block.text, `p-${i}`)}
          </p>
        );
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
    <div className="max-w-6xl mx-auto">
      {/* Deal summary chips */}
      <div className="flex flex-wrap gap-2 mb-4">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LOI Preview — left 2/3 */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-6 sm:p-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-neutral-900">Letter of Intent</h3>
                {/* Version chips */}
                {revisionHistory.length > 1 && (
                  <div className="flex items-center gap-1">
                    {revisionHistory.map(r => (
                      <button
                        key={r.version}
                        onClick={() => setCurrentVersion(r.version)}
                        className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
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
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-700">{charCount.toLocaleString()} chars</span>
                <button
                  type="button"
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-xs px-2 py-1 rounded border border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                >
                  {isEditing ? 'Preview' : 'Edit'}
                </button>
              </div>
            </div>

            {isEditing ? (
              <textarea
                value={currentText}
                onChange={handleTextEdit}
                className="w-full min-h-[600px] font-mono text-sm leading-relaxed p-4 border border-neutral-200 rounded-lg focus:border-teal-primary focus:ring-1 focus:ring-teal-primary/20 outline-none resize-y"
                style={{ fontFamily: "'Courier New', monospace", fontSize: '0.8125rem' }}
              />
            ) : (
              <div className="loi-document-page min-h-[600px] rounded-lg overflow-hidden">
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
            className="rounded-xl p-5 border-l-4"
            style={{ background: '#E8F5F3', borderLeftColor: 'var(--teal-primary)' }}
          >
            <h4 className="text-sm font-semibold text-neutral-900 mb-3">Request a Change</h4>
            <textarea
              value={editInstruction}
              onChange={(e) => setEditInstruction(e.target.value)}
              rows={3}
              className="w-full border border-neutral-200 rounded-lg p-3 text-sm resize-none outline-none focus:border-teal-primary focus:ring-1 focus:ring-teal-primary/20 bg-white"
              placeholder={'e.g. "Change the implementation fee to $30,000"\n"Add a 90-day pilot period before subscription"\n"Remove the confidentiality section"'}
              disabled={isRevising}
            />

            {revisionError && (
              <p className="text-error text-xs mt-2">{revisionError}</p>
            )}

            <div className="flex items-center justify-between mt-3">
              <button
                onClick={handleRevise}
                disabled={isRevising || !editInstruction.trim()}
                className="btn-primary py-2 px-5 text-sm flex items-center gap-2"
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
        <div className="space-y-4">
          <div className="card p-4">
            <h4 className="text-sm font-semibold text-neutral-900 mb-3">Actions</h4>
            <div className="space-y-2">
              <button
                onClick={handleSend}
                className="btn-primary w-full py-2.5"
              >
                Send for Signature →
              </button>
              <button
                onClick={handleRegenerate}
                disabled={isRegenerating}
                className="btn-secondary w-full py-2.5 flex items-center justify-center gap-2"
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
                className="btn-secondary w-full py-2.5"
              >
                ← Back to Form
              </button>
            </div>
          </div>

          <div className="card p-4">
            <h4 className="text-sm font-semibold text-neutral-900 mb-3">Quick Actions</h4>
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
              className="text-sm text-teal-primary hover:text-teal-dark font-medium"
            >
              Download LOI (.txt)
            </button>
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
