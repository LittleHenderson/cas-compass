import { useMemo } from 'react';

const OPERATOR_NAMES = [
  'Idea', 'Mind', 'Positive', 'Negative',
  'Vibration', 'Female', 'Male', 'Rhythm',
  'Above/Cause', 'Below/Effect',
];
const DOMAIN_NAMES: Record<string, string> = { P: 'Principled', C: 'Cognitive', E: 'Evaluative', O: 'Operational' };
const DRIVE_NAMES = ['Unity', 'Wisdom', 'Vitality', 'Connection', 'Agency', 'Structure', 'Purpose'];

interface ParseResult {
  operators: number[];
  domains: string[];
  drives: number[];
  fractal: number[] | null;
  isRpm: boolean;
  valid: boolean;
  error: string;
  english: string;
  /** Detected composition operations: syntactic (+, -) and algebraic (×, ÷, ∘) */
  syntacticOps: string[];
  algebraicOps: string[];
}

function parseNotation(input: string): ParseResult {
  const result: ParseResult = {
    operators: [], domains: [], drives: [], fractal: null,
    isRpm: false, valid: true, error: '', english: '',
    syntacticOps: [], algebraicOps: [],
  };

  if (!input.trim()) {
    result.valid = false;
    result.english = 'Type CAS notation above...';
    return result;
  }

  const text = input.trim();

  // CO-N patterns
  for (const m of text.matchAll(/CO-(\d)/g)) {
    const idx = parseInt(m[1]);
    if (idx <= 9) result.operators.push(idx);
    else { result.valid = false; result.error = `Invalid operator CO-${idx}`; }
  }

  // Domain superscripts ^P ^C ^E ^O
  for (const m of text.matchAll(/\^([PCEO])/g)) {
    result.domains.push(m[1]);
  }

  // Cognitive states P3, C7, E0, O5
  for (const m of text.matchAll(/([PCEO])(\d)/g)) {
    // Only match if not preceded by CO-
    const domain = m[1];
    const opIdx = parseInt(m[2]);
    if (opIdx <= 9 && !result.operators.includes(opIdx)) {
      result.operators.push(opIdx);
    }
    if (!result.domains.includes(domain)) {
      result.domains.push(domain);
    }
  }

  // Drive F1-F7
  for (const m of text.matchAll(/F(\d)/g)) {
    const idx = parseInt(m[1]);
    if (idx >= 1 && idx <= 7) result.drives.push(idx - 1);
    else { result.valid = false; result.error = `Invalid drive F${idx}`; }
  }

  // RPM
  if (/RPM/i.test(text)) result.isRpm = true;

  // Fractal Phi<...> or Φ⟨...⟩
  const fracMatch = text.match(/(?:Phi|Φ)[⟨<]([\d:]+)[⟩>]/);
  if (fracMatch) {
    const indices = fracMatch[1].split(':').map(Number);
    if (indices.every(i => i >= 0 && i <= 9)) {
      result.fractal = indices;
    } else {
      result.valid = false;
      result.error = 'Fractal indices must be 0-9';
    }
  }

  // Detect composition operations
  if (/[+]/.test(text)) result.syntacticOps.push('+');
  if (/[-]/.test(text) && !/->|<-/.test(text)) result.syntacticOps.push('-');
  if (/[*×]/.test(text)) result.algebraicOps.push('×');
  if (/[/÷]/.test(text) && !/\/\//.test(text)) result.algebraicOps.push('÷');
  if (/∘/.test(text)) result.algebraicOps.push('∘');

  // Check for unknown content
  if (result.operators.length === 0 && result.drives.length === 0 && !result.fractal && !result.isRpm) {
    result.valid = false;
    result.error = 'No recognized CAS notation found';
  }

  // Build English — deduplicate and group by domain
  const uniqueOps = [...new Set(result.operators)];
  const uniqueDomains = [...new Set(result.domains)];
  const uniqueDrives = [...new Set(result.drives)];

  const parts: string[] = [];
  if (uniqueOps.length > 0) {
    const opNames = uniqueOps.map(i => `^${i} ${OPERATOR_NAMES[i] ?? `CO-${i}`}`);
    parts.push(opNames.join(', '));
  }
  if (uniqueDomains.length > 0) {
    if (uniqueDomains.length === 1) {
      parts.push(`in the ${DOMAIN_NAMES[uniqueDomains[0]] ?? uniqueDomains[0]} Domain`);
    } else {
      const domNames = uniqueDomains.map(d => DOMAIN_NAMES[d] ?? d);
      const last = domNames.pop();
      parts.push(`across ${domNames.join(', ')} and ${last} Domains`);
    }
  }
  if (uniqueDrives.length > 0) {
    const driveNames = uniqueDrives.map(i => `${DRIVE_NAMES[i] ?? `F${i + 1}`}`);
    parts.push(`driven by ${driveNames.join(' and ')}`);
  }
  if (result.isRpm) parts.push('with RPM prerequisite chain');
  if (result.fractal) parts.push(`fractal signature \u27E8${result.fractal.join(':')}\u27E9`);

  result.english = parts.join(' ') || 'Empty notation';

  return result;
}

function generatePrompt(parsed: ParseResult): string {
  const parts: string[] = [];

  if (parsed.operators.length > 0) {
    const names = parsed.operators.map(i => OPERATOR_NAMES[i]).filter(Boolean);
    parts.push(`Write a response that demonstrates ${names.join(' and ').toLowerCase()}.`);
  }

  if (parsed.domains.length > 0) {
    const dNames = parsed.domains.map(d => DOMAIN_NAMES[d]).filter(Boolean);
    parts.push(`Frame your reasoning in the ${dNames.join(' and ').toLowerCase()} domain.`);
  }

  if (parsed.isRpm) {
    parts.push('Ensure your response follows a clear prerequisite chain: establish motivation before knowledge, and knowledge before action.');
  }

  if (parsed.fractal) {
    parts.push(`Apply cognitive operators in sequence: ${parsed.fractal.map(i => `CO-${i}`).join(' → ')}.`);
  }

  if (parts.length === 0) {
    return 'Explain your reasoning about a complex decision.';
  }

  return parts.join(' ');
}

interface NotationComposerProps {
  notation: string;
  onNotationChange: (notation: string) => void;
  onGenerate: (prompt: string) => void;
}

export function NotationComposer({ notation, onNotationChange, onGenerate }: NotationComposerProps) {
  const parsed = useMemo(() => parseNotation(notation), [notation]);

  const handleGenerate = () => {
    const prompt = generatePrompt(parsed);
    onGenerate(prompt);
  };

  return (
    <div className="space-y-3">
      {/* Notation input */}
      <div>
        <label className="block font-['Geist_Mono'] text-[11px] font-medium uppercase tracking-[0.08em] text-[#86958d] mb-1.5">
          CAS Notation
        </label>
        <input
          type="text"
          value={notation}
          onChange={(e) => onNotationChange(e.target.value)}
          placeholder="CO-3^E + CO-5^C   or   RPM(F5)   or   Phi<1:4:7>"
          className="w-full rounded-[2px] border border-[#20302b] bg-[#13201c] px-4 py-3 text-base sm:text-sm font-['Geist_Mono'] text-[#37f5a0] placeholder-[#62706a] focus:border-[#37f5a0] focus:outline-none"
        />
      </div>

      {/* Parse result */}
      {notation.trim() && (
        <div className={`rounded-[2px] border p-3 ${parsed.valid ? 'border-[#37f5a0]/35 bg-[#13201c]' : 'border-[#ff7b72]/40 bg-[#ff7b72]/10'}`}>
          {parsed.valid ? (
            <>
              <p className="text-xs text-[#eaf3ee] leading-relaxed">{parsed.english}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[...new Set(parsed.operators)].map(op => (
                  <span key={`op-${op}`} className="rounded-[2px] border border-[#37f5a0]/30 bg-[#0c1513] px-2 py-0.5 font-['Geist_Mono'] text-[11px] text-[#37f5a0]">
                    ^{op} {OPERATOR_NAMES[op] ?? `CO-${op}`}
                  </span>
                ))}
                {[...new Set(parsed.domains)].map(d => (
                  <span key={`d-${d}`} className="rounded-[2px] border border-[#20302b] bg-[#0c1513] px-2 py-0.5 font-['Geist_Mono'] text-[11px] text-[#eaf3ee]">
                    {DOMAIN_NAMES[d]}
                  </span>
                ))}
                {[...new Set(parsed.drives)].map(i => (
                  <span key={`f-${i}`} className="rounded-[2px] border border-[#20302b] bg-[#0c1513] px-2 py-0.5 font-['Geist_Mono'] text-[11px] text-[#b3c2ba]">
                    F{i + 1}
                  </span>
                ))}
                {parsed.isRpm && (
                  <span className="rounded-[2px] border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-2 py-0.5 font-['Geist_Mono'] text-[11px] text-[#f59e0b]">RPM</span>
                )}
                {parsed.fractal && (
                  <span className="rounded-[2px] border border-[#20302b] bg-[#0c1513] px-2 py-0.5 font-['Geist_Mono'] text-[11px] text-[#37f5a0]">
                    Φ⟨{parsed.fractal.join(':')}⟩
                  </span>
                )}
                {parsed.syntacticOps.map(op => (
                  <span key={`syn-${op}`} className="rounded-[2px] border border-[#20302b] bg-[#0c1513] px-2 py-0.5 font-['Geist_Mono'] text-[11px] text-[#86958d]" title="Syntactic assembler">
                    {op}
                  </span>
                ))}
                {parsed.algebraicOps.map(op => (
                  <span key={`alg-${op}`} className="rounded-[2px] border border-[#f59e0b]/35 bg-[#0c1513] px-2 py-0.5 font-['Geist_Mono'] text-[11px] text-[#f59e0b]" title="Algebraic transformer">
                    {op}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-[#ff7b72]">{parsed.error || parsed.english}</p>
          )}
        </div>
      )}

      {/* Syntax reference — visually separated from output */}
      <div className="border-t border-[#20302b] pt-2.5 mt-1">
        <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d] mb-1.5">Syntax Reference</p>
        <div className="text-xs leading-relaxed space-y-1">
          <div className="text-[#86958d]">
            <span className="font-['Geist_Mono'] text-[#b3c2ba]">CO-3^E</span> state
            {' · '}
            <span className="font-['Geist_Mono'] text-[#b3c2ba]">RPM(F5)</span> chain
            {' · '}
            <span className="font-['Geist_Mono'] text-[#b3c2ba]">Phi&lt;1:4:7&gt;</span> fractal
            {' · '}
            <span className="font-['Geist_Mono'] text-[#b3c2ba]">P3</span> shorthand
          </div>
          <div className="flex flex-wrap gap-3 text-[11px]">
            <span className="text-[#86958d]">
              <span className="font-['Geist_Mono'] uppercase tracking-[0.08em]">Syntactic</span>{' '}
              <span className="font-['Geist_Mono'] text-[#eaf3ee]">+</span> combine{' '}
              <span className="font-['Geist_Mono'] text-[#eaf3ee]">-</span> remove
            </span>
            <span className="text-[#f59e0b]/85">
              <span className="font-['Geist_Mono'] uppercase tracking-[0.08em]">Algebraic</span>{' '}
              <span className="font-['Geist_Mono'] text-[#f59e0b]">×</span> compose{' '}
              <span className="font-['Geist_Mono'] text-[#f59e0b]">÷</span> ratio{' '}
              <span className="font-['Geist_Mono'] text-[#f59e0b]">∘</span> fractal
            </span>
          </div>
        </div>
      </div>

      {/* Generate button */}
      {parsed.valid && notation.trim() && (
        <button
          onClick={handleGenerate}
          className="w-full rounded-[2px] bg-[#37f5a0] px-4 py-3 sm:py-2 text-sm font-semibold text-[#050b0a] hover:bg-[#37f5a0]/90 transition-colors min-h-[44px]"
        >
          Generate Targeted Scenario
        </button>
      )}
    </div>
  );
}
