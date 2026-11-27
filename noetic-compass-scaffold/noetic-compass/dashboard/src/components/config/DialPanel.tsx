import { useState, useEffect } from 'react';
import { DialSlider } from './DialSlider';
import { validateDials } from '../../lib/validation';
import { INVOLUTION_PAIRS } from '../../lib/constants';

const DEFAULT_DIALS = [6, 6, 6, 6, 6, 6, 6, 6, 6, 6];

export function DialPanel({
  initialValues,
  onSave,
  saving,
}: {
  initialValues?: number[];
  onSave: (values: number[]) => void;
  saving: boolean;
}) {
  const [values, setValues] = useState<number[]>(initialValues ?? DEFAULT_DIALS);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (initialValues) setValues(initialValues);
  }, [initialValues]);

  useEffect(() => {
    setErrors(validateDials(values));
  }, [values]);

  function handleChange(index: number, value: number) {
    setValues((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function handleReset() {
    setValues([...DEFAULT_DIALS]);
  }

  const isValid = errors.length === 0;

  const selfDualIndices = [0, 1, 4, 7];
  const pairIndices = INVOLUTION_PAIRS;

  return (
    <div className="space-y-6">
      <div>
        <h4 className="mb-3 font-['Geist_Mono'] text-[11px] font-medium uppercase tracking-[0.08em] text-[#86958d]">Self-Dual Operators</h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {selfDualIndices.map((i) => (
            <DialSlider key={i} index={i} value={values[i]} onChange={handleChange} />
          ))}
        </div>
      </div>

      <div>
        <h4 className="mb-3 font-['Geist_Mono'] text-[11px] font-medium uppercase tracking-[0.08em] text-[#86958d]">Involution Pairs</h4>
        <div className="space-y-4">
          {pairIndices.map(([a, b]) => {
            const divergence = Math.abs(values[a] - values[b]);
            const isWarning = divergence >= 3;
            return (
              <div key={`${a}-${b}`} className={`rounded-[2px] border p-4 ${isWarning ? 'border-[#f59e0b]/45 bg-[#f59e0b]/10' : 'border-[#20302b] bg-[#13201c]'}`}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <DialSlider index={a} value={values[a]} onChange={handleChange} />
                  <DialSlider index={b} value={values[b]} onChange={handleChange} />
                </div>
                <div className={`mt-2 text-center font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] ${isWarning ? 'text-[#f59e0b]' : 'text-[#86958d]'}`}>
                  Divergence: {divergence} / 4 max
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="rounded-[2px] border border-[#ff7b72]/40 bg-[#ff7b72]/10 p-3 text-xs text-[#ff7b72]">
          {errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          onClick={() => onSave(values)}
          disabled={!isValid || saving}
          className="rounded-[2px] bg-[#37f5a0] px-5 py-3 sm:py-2 text-sm font-semibold text-[#050b0a] hover:bg-[#37f5a0]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px]"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
        <button
          onClick={handleReset}
          className="rounded-[2px] border border-[#eaf3ee] bg-transparent px-4 py-3 sm:py-2 text-sm font-medium text-[#eaf3ee] hover:bg-[#13201c] transition-colors min-h-[44px]"
        >
          Reset to Default
        </button>
      </div>
    </div>
  );
}
