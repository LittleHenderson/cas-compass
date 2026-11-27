import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/shared/Card';
import { HowItWorksPanel } from '../components/shared/HowItWorksPanel';
import { apiFetch } from '../api/client';

const HOW_IT_WORKS_SECTIONS = [
  {
    title: 'How to Use the Scenario Library',
    body: (
      <p className="text-[#b3c2ba]">
        Browse pre-built assessment scenarios designed to test specific AI capabilities. Each scenario
        targets particular Cognitive Operators, Processing Domains, and Core Drives.
      </p>
    ),
  },
  {
    title: 'How It Works',
    body: (
      <ol className="list-decimal list-inside space-y-1 text-[#b3c2ba]">
        <li>Browse by category or search for specific topics.</li>
        <li>Click any scenario to see what it tests and why.</li>
        <li>Click <strong className="text-[#eaf3ee]">Run Assessment</strong> to score an AI against that scenario.</li>
        <li>Review the results to see how the AI performed on the targeted dimensions.</li>
      </ol>
    ),
  },
  {
    title: 'Categories',
    body: (
      <p className="text-[#b3c2ba]">
        Healthcare Ethics, Hiring &amp; Workforce, Financial, Governance, Education, Relationships,
        AI Safety, Environmental, Adversarial Red Team, and Life Execution.
      </p>
    ),
  },
  {
    title: 'Each Scenario Shows',
    body: (
      <ul className="list-disc list-inside space-y-1 text-[#b3c2ba]">
        <li>What Cognitive Operators it targets.</li>
        <li>Which Processing Domains are tested.</li>
        <li>What a resilient response looks like.</li>
        <li>What a vulnerable response looks like.</li>
      </ul>
    ),
  },
];

interface Scenario {
  id: string;
  title: string;
  category: string;
  group?: string | null;
  prompt?: string;
  prompt_text?: string;
  target_operators?: number[];
  target_domains?: string[];
  target_drives?: number[];
  difficulty?: string;
  what_it_tests?: string;
  success_indicator?: string;
  failure_indicator?: string;
  cas_notation?: string | null;
  cas_notation_validated?: boolean;
  cas_notation_english?: string | null;
  cas_notation_source?: string;
}

const CAT_COLORS: Record<string, string> = {
  healthcare: '#37f5a0', hiring: '#60a5fa', finance: '#f59e0b',
  governance: '#a78bfa', education: '#38bdf8', relationships: '#f472b6',
  ai_safety: '#ff7b72', environmental: '#37f5a0', adversarial_resilience: '#ff7b72',
  life_execution: '#818cf8', cas_patterns: '#37f5a0',
};

const CAT_LABELS: Record<string, string> = {
  healthcare: 'Healthcare', hiring: 'Hiring & HR', finance: 'Finance',
  governance: 'Governance', education: 'Education', relationships: 'Relationships',
  ai_safety: 'AI Safety', environmental: 'Environmental',
  adversarial_resilience: 'Adversarial', life_execution: 'Life Execution',
  cas_patterns: 'CAS Patterns',
};

const DIFF_COLORS: Record<string, string> = {
  easy: '#37f5a0', moderate: '#f59e0b', hard: '#ff7b72',
};

const FEATURED_CATEGORY_ORDER = [
  'ai_safety',
  'governance',
  'finance',
  'healthcare',
  'hiring',
  'education',
  'life_execution',
  'relationships',
  'environmental',
  'adversarial_resilience',
  'cas_patterns',
];

function getScenarioPrompt(scenario: Scenario): string {
  return scenario.prompt_text ?? scenario.prompt ?? '';
}

function pickFeaturedScenario(scenarios: Scenario[]): Scenario | null {
  if (scenarios.length === 0) return null;

  for (const category of FEATURED_CATEGORY_ORDER) {
    const match = scenarios.find(
      (scenario) =>
        scenario.category === category
        && scenario.difficulty !== 'hard'
        && Boolean(getScenarioPrompt(scenario).trim()),
    );
    if (match) return match;
  }

  return scenarios.find((scenario) => Boolean(getScenarioPrompt(scenario).trim())) ?? scenarios[0];
}

export function ScenarioBrowserPage() {
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hasAutoExpanded, setHasAutoExpanded] = useState(false);
  const scenarioRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<{ scenarios: Scenario[] }>('/scenarios');
        setScenarios(data.scenarios ?? []);
        setLoadError(null);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load scenarios');
      }
      setLoading(false);
    })();
  }, []);

  const categories = useMemo(() => {
    const cats: Record<string, number> = {};
    for (const s of scenarios) cats[s.category] = (cats[s.category] ?? 0) + 1;
    return Object.entries(cats).sort(([, a], [, b]) => b - a);
  }, [scenarios]);

  const filtered = useMemo(() => {
    let r = scenarios;
    if (selectedCat) r = r.filter(s => s.category === selectedCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(s =>
        (s.prompt_text ?? s.prompt ?? '').toLowerCase().includes(q) ||
        (s.title ?? '').toLowerCase().includes(q) ||
        (s.what_it_tests ?? '').toLowerCase().includes(q)
      );
    }
    return r;
  }, [scenarios, selectedCat, search]);

  const featuredScenario = useMemo(() => {
    const filteredMode = Boolean(selectedCat) || Boolean(search.trim());
    return pickFeaturedScenario(filteredMode ? filtered : scenarios);
  }, [filtered, scenarios, search, selectedCat]);

  useEffect(() => {
    if (!featuredScenario || hasAutoExpanded) return;
    setExpandedId(featuredScenario.id);
    setHasAutoExpanded(true);
  }, [featuredScenario, hasAutoExpanded]);

  function openAssessment(scenario: Scenario) {
    const prompt = getScenarioPrompt(scenario);
    navigate('/assessment', {
      state: {
        prefill: prompt,
        notationPrefill: scenario.cas_notation || undefined,
        notationEnglish: scenario.cas_notation_english || undefined,
        scenarioId: scenario.id,
      },
    });
  }

  function previewScenarioDetails(id: string) {
    setExpandedId(id);
    window.requestAnimationFrame(() => {
      scenarioRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <HowItWorksPanel sections={HOW_IT_WORKS_SECTIONS} label="How to Use Scenarios" />

      <div>
        <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#37f5a0] mb-1">
          ◐ Prototype · Scenario Library
        </p>
        <h1 className="font-['Space_Grotesk'] text-2xl font-bold tracking-[-0.03em] text-[#eaf3ee] mb-1">
          Scenario Browser
        </h1>
        <p className="text-sm text-[#b3c2ba]">
          {scenarios.length} assessment scenarios across {categories.length} categories.
        </p>
      </div>

      {featuredScenario && (
        <Card title="Start Here">
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-[#b3c2ba]">
              First-time users should not have to invent a prompt from scratch. Start with one featured scenario, see how the system evaluates it, then branch into the rest of the library.
            </p>
            <div
              className="rounded-[2px] border bg-[#13201c] px-4 py-4"
              style={{ borderColor: `${CAT_COLORS[featuredScenario.category] ?? '#20302b'}55` }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="rounded-[2px] px-2 py-0.5 font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em]"
                  style={{
                    backgroundColor: `${CAT_COLORS[featuredScenario.category] ?? '#86958d'}20`,
                    color: CAT_COLORS[featuredScenario.category] ?? '#eaf3ee',
                  }}
                >
                  Featured Scenario
                </span>
                <span className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">
                  {CAT_LABELS[featuredScenario.category] ?? featuredScenario.category}
                </span>
                {featuredScenario.difficulty && (
                  <span
                    className="rounded-[2px] px-2 py-0.5 font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em]"
                    style={{
                      backgroundColor: `${DIFF_COLORS[featuredScenario.difficulty] ?? '#86958d'}20`,
                      color: DIFF_COLORS[featuredScenario.difficulty] ?? '#eaf3ee',
                    }}
                  >
                    {featuredScenario.difficulty}
                  </span>
                )}
              </div>
              <h2 className="mt-3 font-['Space_Grotesk'] text-lg font-semibold tracking-[-0.02em] text-[#eaf3ee]">
                {featuredScenario.title}
              </h2>
              {featuredScenario.what_it_tests && (
                <p className="mt-2 text-sm leading-relaxed text-[#b3c2ba]">{featuredScenario.what_it_tests}</p>
              )}
              <p className="mt-3 text-xs leading-relaxed text-[#86958d]">
                {getScenarioPrompt(featuredScenario).slice(0, 220)}
                {getScenarioPrompt(featuredScenario).length > 220 ? '...' : ''}
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => openAssessment(featuredScenario)}
                  className="rounded-[2px] bg-[#37f5a0] px-4 py-2.5 text-sm font-semibold text-[#050b0a] hover:bg-[#37f5a0]/90 transition-colors min-h-[44px]"
                >
                  Run Featured Scenario
                </button>
                <button
                  onClick={() => previewScenarioDetails(featuredScenario.id)}
                  className="rounded-[2px] border border-[#eaf3ee] bg-transparent px-4 py-2.5 text-sm font-medium text-[#eaf3ee] hover:bg-[#0c1513] transition-colors min-h-[44px]"
                >
                  Preview Scenario Details
                </button>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search scenarios..." className="flex-1 rounded-[2px] border border-[#20302b] bg-[#13201c] px-4 py-2 text-sm text-[#eaf3ee] placeholder-[#62706a] focus:border-[#37f5a0] focus:outline-none min-h-[44px]" />
        <select value={selectedCat ?? ''} onChange={e => setSelectedCat(e.target.value || null)}
          className="rounded-[2px] border border-[#20302b] bg-[#13201c] px-3 py-2 text-sm text-[#eaf3ee] focus:border-[#37f5a0] focus:outline-none min-h-[44px]">
          <option value="" className="bg-[#0c1513]">All ({scenarios.length})</option>
          {categories.map(([c, n]) => <option key={c} value={c} className="bg-[#0c1513]">{CAT_LABELS[c] ?? c} ({n})</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setSelectedCat(null)}
          className={`rounded-[2px] border px-3 py-1.5 font-['Geist_Mono'] text-[11px] uppercase tracking-[0.06em] transition-colors min-h-[36px] ${!selectedCat ? 'border-[#37f5a0] bg-[#13201c] text-[#37f5a0]' : 'border-[#20302b] bg-[#0c1513] text-[#86958d] hover:text-[#eaf3ee]'}`}>
          All ({scenarios.length})
        </button>
        {categories.map(([c, n]) => {
          const color = CAT_COLORS[c] ?? '#86958d';
          const isActive = selectedCat === c;
          return (
            <button
              key={c}
              onClick={() => setSelectedCat(isActive ? null : c)}
              className="rounded-[2px] px-3 py-1.5 font-['Geist_Mono'] text-[11px] uppercase tracking-[0.06em] transition-colors min-h-[36px]"
              style={{
                color: isActive ? '#050b0a' : color,
                backgroundColor: isActive ? color : '#0c1513',
                borderWidth: '1px',
                borderColor: isActive ? color : `${color}45`,
              }}
            >
              {CAT_LABELS[c] ?? c} ({n})
            </button>
          );
        })}
      </div>

      <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">
        Showing {filtered.length} of {scenarios.length}
      </p>

      {loading ? (
        <Card><p className="text-sm text-[#86958d] text-center py-8">Loading scenarios...</p></Card>
      ) : loadError ? (
        <Card>
          <div className="text-center py-8 space-y-2">
            <p className="text-sm text-[#ff7b72] font-medium">Could not load scenarios</p>
            <p className="text-xs text-[#86958d]">{loadError}</p>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card><p className="text-sm text-[#86958d] text-center py-8">No scenarios match your search.</p></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => {
            const color = CAT_COLORS[s.category] ?? '#86958d';
            const diffColor = DIFF_COLORS[s.difficulty ?? 'moderate'] ?? '#86958d';
            const open = expandedId === s.id;
            const prompt = getScenarioPrompt(s);
            return (
              <div
                key={s.id}
                ref={(node) => {
                  scenarioRefs.current[s.id] = node;
                }}
                className="rounded-[2px] border border-[#20302b] bg-[#0c1513] overflow-hidden scroll-mt-24 transition-colors duration-150"
                style={open ? { borderColor: `${color}66` } : undefined}
              >
                <button onClick={() => setExpandedId(open ? null : s.id)} className="w-full flex items-start gap-3 p-4 text-left hover:bg-[#13201c]/50 transition-colors min-h-[44px]">
                  <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-['Geist_Mono'] text-[11px] text-[#62706a]">{s.id}</span>
                      <span className="rounded-[2px] px-1.5 py-0.5 font-['Geist_Mono'] text-[10px] uppercase tracking-[0.06em]" style={{ backgroundColor: `${color}18`, color }}>{CAT_LABELS[s.category] ?? s.category}</span>
                      {s.difficulty && <span className="rounded-[2px] px-1.5 py-0.5 font-['Geist_Mono'] text-[10px] uppercase tracking-[0.06em]" style={{ backgroundColor: `${diffColor}18`, color: diffColor }}>{s.difficulty}</span>}
                    </div>
                    <p className="font-['Space_Grotesk'] text-sm font-semibold text-[#eaf3ee] mb-0.5">{s.title}</p>
                    <p className="text-xs text-[#86958d] line-clamp-2">{prompt.slice(0, 150)}{prompt.length > 150 ? '...' : ''}</p>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"
                    className={`text-[#86958d] shrink-0 mt-1 transition-transform ${open ? 'rotate-180' : ''}`}>
                    <path d="M3 5l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {open && (
                  <div className="px-4 pb-4 space-y-3 border-t border-[#20302b] pt-3">
                    <p className="text-xs text-[#b3c2ba] leading-relaxed whitespace-pre-wrap">{prompt}</p>
                    {s.what_it_tests && (
                      <div className="rounded-[2px] bg-[#13201c] border border-[#20302b] p-3">
                        <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d] mb-1">What It Tests</p>
                        <p className="text-xs text-[#b3c2ba]">{s.what_it_tests}</p>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 font-['Geist_Mono'] text-[11px]">
                      {s.target_operators?.map(op => <span key={`op-${op}`} className="px-2 py-0.5 rounded-[2px] border border-[#37f5a0]/30 bg-[#13201c] text-[#37f5a0]">CO-{op}</span>)}
                      {s.target_domains?.map(d => <span key={`d-${d}`} className="px-2 py-0.5 rounded-[2px] border border-[#20302b] bg-[#13201c] text-[#eaf3ee]">{d}</span>)}
                      {s.target_drives?.map(i => <span key={`f-${i}`} className="px-2 py-0.5 rounded-[2px] border border-[#20302b] bg-[#13201c] text-[#b3c2ba]">F{i + 1}</span>)}
                    </div>
                    {s.cas_notation && (
                      <div className="rounded-[2px] bg-[#13201c] border border-[#20302b] p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">CAS Notation</p>
                          {s.cas_notation_validated ? (
                            <span className="rounded-[2px] border border-[#37f5a0]/35 bg-[#0c1513] px-1.5 py-0.5 font-['Geist_Mono'] text-[10px] uppercase text-[#37f5a0]">validated</span>
                          ) : (
                            <span className="rounded-[2px] border border-[#f59e0b]/35 bg-[#0c1513] px-1.5 py-0.5 font-['Geist_Mono'] text-[10px] uppercase text-[#f59e0b]">unvalidated</span>
                          )}
                        </div>
                        <p className="text-xs font-['Geist_Mono'] text-[#37f5a0]">{s.cas_notation}</p>
                        {s.cas_notation_english && (
                          <p className="text-xs text-[#b3c2ba] mt-1">{s.cas_notation_english}</p>
                        )}
                      </div>
                    )}
                    {(s.success_indicator || s.failure_indicator) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {s.success_indicator && <div className="rounded-[2px] bg-[#13201c] border border-[#37f5a0]/30 p-2.5"><p className="font-['Geist_Mono'] text-[10px] uppercase tracking-[0.08em] text-[#37f5a0] mb-0.5">Resilient</p><p className="text-xs text-[#b3c2ba]">{s.success_indicator}</p></div>}
                        {s.failure_indicator && <div className="rounded-[2px] bg-[#13201c] border border-[#ff7b72]/35 p-2.5"><p className="font-['Geist_Mono'] text-[10px] uppercase tracking-[0.08em] text-[#ff7b72] mb-0.5">Vulnerable</p><p className="text-xs text-[#b3c2ba]">{s.failure_indicator}</p></div>}
                      </div>
                    )}
                    <button onClick={() => openAssessment(s)}
                      className="w-full rounded-[2px] bg-[#37f5a0] px-4 py-2.5 text-xs font-semibold text-[#050b0a] hover:bg-[#37f5a0]/90 transition-colors min-h-[44px]">
                      Run This Assessment
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
