const OP_NAMES = [
  'Idea', 'Mind', 'Positive', 'Negative',
  'Vibration', 'Female', 'Male', 'Rhythm',
  'Above/Cause', 'Below/Effect',
];
const DRIVE_NAMES = ['Unity', 'Wisdom', 'Vitality', 'Connection', 'Agency', 'Structure', 'Purpose'];

interface GapMap {
  absent_operators: number[];
  absent_domains: string[];
  absent_drives: number[];
  strongest_cluster: number[];
  largest_void: string;
}

interface LacunarityProfile {
  state: number;
  fractal: number;
  domain: number;
  drive: number;
  rpm_resolution: number;
  composite: number;
  classification: string;
  gap_map: GapMap;
}

function barColor(value: number): string {
  if (value < 0.5) return 'bg-[#37f5a0]';
  if (value < 1.5) return 'bg-[#f59e0b]';
  if (value < 3.0) return 'bg-orange-400';
  return 'bg-[#ff7b72]';
}

function classColor(cls: string): string {
  if (cls === 'Uniform') return 'text-[#37f5a0]';
  if (cls === 'Moderate') return 'text-[#f59e0b]';
  if (cls === 'Concentrated') return 'text-orange-400';
  return 'text-[#ff7b72]';
}

function LacBar({ label, value, maxVal = 3.0 }: { label: string; value: number; maxVal?: number }) {
  const pct = Math.min(100, (value / maxVal) * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-[#b3c2ba] shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-[2px] bg-[#13201c] border border-[#20302b] overflow-hidden">
        <div className={`h-full transition-all ${barColor(value)}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-[#86958d] font-['Geist_Mono'] text-[11px]">{value.toFixed(2)}</span>
    </div>
  );
}

export function LacunarityCard({ profile }: { profile: LacunarityProfile }) {
  const gm = profile.gap_map;

  return (
    <div className="space-y-4">
      {/* Composite */}
      <div className="flex items-center gap-3">
        <span className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">Composite</span>
        <span className={`font-['Space_Grotesk'] text-lg font-bold ${classColor(profile.classification)}`}>
          {profile.composite.toFixed(2)}
        </span>
        <span className={`rounded-[2px] border px-2 py-0.5 font-['Geist_Mono'] text-[11px] uppercase tracking-[0.06em] ${
          profile.classification === 'Uniform' ? 'border-[#37f5a0]/40 bg-[#13201c] text-[#37f5a0]' :
          profile.classification === 'Moderate' ? 'border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b]' :
          profile.classification === 'Concentrated' ? 'border-orange-400/40 bg-orange-400/10 text-orange-300' :
          'border-[#ff7b72]/40 bg-[#ff7b72]/10 text-[#ff7b72]'
        }`}>
          {profile.classification}
        </span>
      </div>

      {/* Dimension bars */}
      <div className="space-y-1.5">
        <LacBar label="Operator" value={profile.state} />
        <LacBar label="Fractal" value={profile.fractal} maxVal={1.0} />
        <LacBar label="Domain" value={profile.domain} maxVal={1.0} />
        <LacBar label="Drive" value={profile.drive} maxVal={1.0} />
        <LacBar label="RPM Resol." value={profile.rpm_resolution} maxVal={1.0} />
      </div>

      {/* Gap Map */}
      <div className="rounded-[2px] border border-[#20302b] bg-[#13201c] p-3 space-y-2">
        <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">Gap Map</p>

        {/* 10-dot operator X-ray */}
        <div className="flex justify-center gap-1.5 py-1">
          {Array.from({ length: 10 }, (_, i) => {
            const present = !gm.absent_operators.includes(i);
            const strong = gm.strongest_cluster.includes(i);
            return (
              <div
                key={i}
                className={`w-4 h-4 rounded-full border transition-colors ${
                  strong ? 'bg-[#37f5a0] border-[#37f5a0]' :
                  present ? 'bg-[#62706a]/50 border-[#86958d]' :
                  'bg-transparent border-[#20302b]'
                }`}
                title={`CO-${i}: ${OP_NAMES[i]}${strong ? ' (concentrated)' : present ? '' : ' (absent)'}`}
              />
            );
          })}
        </div>

        {gm.absent_operators.length > 0 && (
          <p className="text-xs text-[#b3c2ba]">
            <span className="font-['Geist_Mono'] text-[#ff7b72]">Absent operators:</span>{' '}
            {gm.absent_operators.map(i => `CO-${i} ${OP_NAMES[i]}`).join(', ')}
          </p>
        )}
        {gm.absent_domains.length > 0 && (
          <p className="text-xs text-[#b3c2ba]">
            <span className="font-['Geist_Mono'] text-[#ff7b72]">Absent domains:</span>{' '}
            {gm.absent_domains.join(', ')}
          </p>
        )}
        {gm.absent_drives.length > 0 && (
          <p className="text-xs text-[#b3c2ba]">
            <span className="font-['Geist_Mono'] text-[#ff7b72]">Absent drives:</span>{' '}
            {gm.absent_drives.map(i => `F${i} ${DRIVE_NAMES[i - 1] ?? ''}`).join(', ')}
          </p>
        )}
        {gm.strongest_cluster.length > 0 && (
          <p className="text-xs text-[#b3c2ba]">
            <span className="font-['Geist_Mono'] text-[#37f5a0]">Concentration:</span>{' '}
            {gm.strongest_cluster.map(i => `CO-${i} ${OP_NAMES[i]}`).join(', ')}
          </p>
        )}
        <p className="text-xs text-[#86958d] italic">{gm.largest_void}</p>
      </div>
    </div>
  );
}
