import { useState } from 'react';
import { ExplainPanel } from '../shared/ExplainPanel';
import { interpretRpmChain, interpretRpmSummary } from '../../lib/interpretations';
import { classifyRpmStage, RPM_NODE_TYPES } from '../../lib/rpmStages';

const NODE_LABELS = ['A0', 'D', 'W', 'P'];

interface ResolutionDetail {
  drive: number;
  resolutions: { node: string; mechanism: string; operators: string[]; strength: number; components?: number }[];
}

export function RpmGraph({
  a0Score,
  driveScores,
  rpmCompleteness,
  resolutionDetails = [],
}: {
  a0Score: number;
  driveScores: number[][];
  rpmCompleteness: number;
  resolutionDetails?: ResolutionDetail[];
}) {
  const [selectedDrive, setSelectedDrive] = useState<number | null>(null);

  const rowH = 34;
  const colW = 70;
  const nodeR = 11;
  const startX = 40;
  const startY = 26;
  const svgW = startX + colW * 4 + 40;
  const svgH = startY + rowH * 7 + 20;

  const chainInsights = selectedDrive !== null
    ? interpretRpmChain(selectedDrive, driveScores[selectedDrive], a0Score)
    : null;
  const summary = interpretRpmSummary(driveScores, a0Score, rpmCompleteness);

  return (
    <div>
      <div className="animate-chart-in">
        <svg width={svgW} height={svgH} className="text-xs">
          {NODE_LABELS.map((label, ci) => (
            <text
              key={label}
              x={startX + ci * colW}
              y={12}
              textAnchor="middle"
              fill="#86958d"
              fontSize="10"
            >
              {label}
            </text>
          ))}

          {driveScores.map((stages, row) => {
            const y = startY + row * rowH;
            const scores = [a0Score, ...stages];
            const isSelected = selectedDrive === row;

            return (
              <g
                key={row}
                className="cursor-pointer"
                onClick={() => setSelectedDrive(isSelected ? null : row)}
                opacity={selectedDrive === null || isSelected ? 1 : 0.35}
              >
                <text x={4} y={y + 4} fill={isSelected ? '#eaf3ee' : '#86958d'} fontSize="10" fontWeight={isSelected ? '700' : '500'}>F{row + 1}</text>

                {scores.slice(0, -1).map((_, ci) => {
                  const x1 = startX + ci * colW + nodeR + 2;
                  const x2 = startX + (ci + 1) * colW - nodeR - 2;
                  const met = scores[ci] >= 0.5 && scores[ci + 1] >= 0.5;
                  return (
                    <line
                      key={ci}
                      x1={x1} y1={y} x2={x2} y2={y}
                      stroke={met ? '#37f5a0' : '#ff7b72'}
                      strokeWidth={1.5}
                      strokeOpacity={0.7}
                      markerEnd="url(#arrowhead-dark)"
                    />
                  );
                })}

                {scores.map((score, ci) => {
                  const stage = classifyRpmStage(RPM_NODE_TYPES[ci], score);
                  return (
                    <g key={ci}>
                      <circle
                        cx={startX + ci * colW}
                        cy={y}
                        r={nodeR}
                        fill={stage.color}
                        fillOpacity={0.18}
                        stroke={stage.color}
                        strokeWidth={isSelected ? 2.5 : 1.5}
                      />
                      <text
                        x={startX + ci * colW}
                        y={y + 3}
                        textAnchor="middle"
                        fill={stage.color}
                        fontSize="8"
                        fontWeight="600"
                      >
                        {(score * 100).toFixed(0)}
                      </text>
                      {isSelected && (
                        <text
                          x={startX + ci * colW}
                          y={y + nodeR + 12}
                          textAnchor="middle"
                          fill={stage.color}
                          fontSize="7"
                          fontWeight="500"
                        >
                          {stage.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

          <defs>
            <marker id="arrowhead-dark" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
              <polygon points="0 0, 6 2, 0 4" fill="#62706a" />
            </marker>
          </defs>
        </svg>
        <div className="mt-1 font-['Geist_Mono'] text-xs text-[#86958d] text-center font-medium">
          RPM Completeness: <span className="text-[#37f5a0]">{(rpmCompleteness * 100).toFixed(1)}%</span>
          {resolutionDetails.length > 0 && (
            <span className="ml-2 text-[#37f5a0]">
              ({resolutionDetails.reduce((n, d) => n + d.resolutions.length, 0)} recursive resolutions)
            </span>
          )}
        </div>
        {/* Resolution details when a drive is selected */}
        {selectedDrive !== null && resolutionDetails.find(d => d.drive === selectedDrive)?.resolutions.length ? (
          <div className="mt-2 space-y-1.5 px-2">
            {resolutionDetails
              .filter(d => d.drive === selectedDrive)
              .flatMap(d => d.resolutions)
              .map((res, i) => (
                <div key={i} className="flex items-start gap-2 rounded-[2px] bg-[#13201c] border border-[#37f5a0]/35 px-2.5 py-1.5">
                  <span className="text-[#37f5a0] text-xs mt-0.5">✓</span>
                  <div className="text-xs">
                    <span className="text-[#37f5a0] font-semibold capitalize">{res.node}</span>
                    <span className="text-[#b3c2ba]"> resolved via </span>
                    <span className="text-[#eaf3ee] font-['Geist_Mono']">
                      {res.mechanism === 'exposure_loop' ? 'Exposure Loop (CO-1 Mind→CO-4 Vibration→CO-7 Rhythm)' :
                       res.mechanism === 'knowledge_reception' ? 'Receptive Formation (CO-5 Female)' :
                       res.mechanism === 'knowledge_decomposition' ? `Compositional Decomposition (CO-6 Male, ${res.components ?? '?'} components)` :
                       res.mechanism === 'causal_search' ? 'Trigger-Effect Chain (CO-8 Above/Cause→CO-9 Below/Effect)' :
                       res.mechanism}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        ) : null}
        <div className="chart-hint text-center font-['Geist_Mono'] text-[10px] text-[#86958d] opacity-0 transition-opacity">
          Click a drive row for details
        </div>
      </div>

      {chainInsights ? (
        <ExplainPanel visible={true} onClose={() => setSelectedDrive(null)}>
          <p className="font-medium text-[#eaf3ee]">F{selectedDrive! + 1} Capability Chain</p>
          <div className="mt-1 space-y-1">
            {chainInsights.map((node, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={`mt-1 flex-shrink-0 w-2 h-2 rounded-full ${node.chainStatus === 'flowing' ? 'bg-[#37f5a0]' : 'bg-[#ff7b72]'}`} />
                <span className="text-xs">{node.description}</span>
              </div>
            ))}
          </div>
        </ExplainPanel>
      ) : (
        <ExplainPanel visible={selectedDrive === null && false} onClose={() => {}}>
          <p>{summary}</p>
        </ExplainPanel>
      )}
    </div>
  );
}
