import { OPERATOR_LABELS } from '../../lib/constants';

export function DialSlider({
  index,
  value,
  onChange,
}: {
  index: number;
  value: number;
  onChange: (index: number, value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.06em] text-[#86958d]">
        {OPERATOR_LABELS[index]}
      </label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={3}
          max={9}
          step={1}
          value={value}
          onChange={(e) => onChange(index, Number(e.target.value))}
          className="flex-1 accent-[#37f5a0]"
        />
        <span className="w-7 text-center text-sm font-['Geist_Mono'] font-bold text-[#37f5a0]">
          {value}
        </span>
      </div>
    </div>
  );
}
