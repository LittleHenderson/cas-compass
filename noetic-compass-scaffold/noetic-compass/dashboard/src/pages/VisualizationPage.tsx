import { useState } from 'react';
import {
  MOCK_PROFILE_A,
  MOCK_PROFILE_LACUNARIC,
  RadialArchitectureDisplay,
} from '../components/RadialArchitectureDisplay';
import { TemporalCognitiveScore } from '../components/TemporalCognitiveScore';
import { Card } from '../components/shared/Card';
import type { CognitiveStateData, Domain } from '../lib/mandala_types';
import { DOMAIN_NAMES } from '../lib/mandala_types';

const PROFILES: readonly {
  id: string;
  label: string;
  description: string;
  data: CognitiveStateData;
}[] = [
  {
    id: 'balanced',
    label: 'Balanced reference',
    description: 'A readable profile with activity across the main CAS axes.',
    data: MOCK_PROFILE_A,
  },
  {
    id: 'lacunarity',
    label: 'Visible gaps',
    description: 'A profile where structural absence becomes both visible and audible.',
    data: MOCK_PROFILE_LACUNARIC,
  },
];

export function VisualizationPage() {
  const [profileId, setProfileId] = useState(PROFILES[0].id);
  const [activeDomain, setActiveDomain] = useState<Domain | null>(null);
  const activeProfile = PROFILES.find((profile) => profile.id === profileId) ?? PROFILES[0];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="rounded-[2px] border border-[#37f5a0]/35 bg-[#13201c] px-2.5 py-1 font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#37f5a0]">
            ◐ Prototype · Multi-Modal Cognitive Signature
          </span>
          <span className="rounded-[2px] border border-[#f59e0b]/35 bg-[#13201c] px-2.5 py-1 font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#f59e0b]">
            Audio requires Play
          </span>
        </div>
        <h1 className="max-w-3xl font-['Space_Grotesk'] text-3xl font-bold tracking-[-0.03em] text-[#eaf3ee] sm:text-4xl">
          See and hear the same CAS structure.
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-[#b3c2ba]">
          Pick a profile. Inspect the state. Press play.
        </p>
      </div>

      <Card title="Choose a profile">
        <div className="grid gap-3 md:grid-cols-2">
          {PROFILES.map((profile) => (
            <button
              key={profile.id}
              type="button"
              onClick={() => {
                setProfileId(profile.id);
                setActiveDomain(null);
              }}
              className={`rounded-[2px] border p-4 text-left transition-colors ${
                profile.id === profileId
                  ? 'border-[#37f5a0] bg-[#13201c] text-[#eaf3ee]'
                  : 'border-[#20302b] bg-[#0c1513] text-[#b3c2ba] hover:border-[#62706a]'
              }`}
            >
              <p className="font-['Space_Grotesk'] text-sm font-semibold text-[#eaf3ee]">{profile.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-[#86958d]">{profile.description}</p>
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card
          title="Radial Architecture Display"
          action={
            <span className="rounded-[2px] border border-[#20302b] bg-[#13201c] px-2.5 py-1 font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">
              {activeDomain ? `Sounding ${activeDomain} ${DOMAIN_NAMES[activeDomain]}` : 'Idle'}
            </span>
          }
        >
          <RadialArchitectureDisplay
            data={activeProfile.data}
            title="Radial Architecture Display"
            highlightDomain={activeDomain}
          />
        </Card>

        <Card title="Temporal Cognitive Score">
          <TemporalCognitiveScore
            cognitiveState={activeProfile.data}
            onCurrentDomainChange={setActiveDomain}
          />
        </Card>
      </div>

      <Card title="Quick key">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[2px] border border-[#20302b] bg-[#13201c] p-4">
            <p className="font-['Space_Grotesk'] text-sm font-semibold text-[#eaf3ee]">Pitch means Noetic</p>
            <p className="mt-1 text-xs text-[#86958d]">Different primitive.</p>
          </div>
          <div className="rounded-[2px] border border-[#20302b] bg-[#13201c] p-4">
            <p className="font-['Space_Grotesk'] text-sm font-semibold text-[#eaf3ee]">Expression means Register</p>
            <p className="mt-1 text-xs text-[#86958d]">Different processing mode.</p>
          </div>
          <div className="rounded-[2px] border border-[#20302b] bg-[#13201c] p-4">
            <p className="font-['Space_Grotesk'] text-sm font-semibold text-[#eaf3ee]">Silence means lacunarity</p>
            <p className="mt-1 text-xs text-[#86958d]">Detected structural gap.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default VisualizationPage;
