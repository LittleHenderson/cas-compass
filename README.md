# CAS Compass

**CAS Compass** is the AI Cognitive Architecture Assessment & Behavior-Audit Platform by **[CAS Lab](https://www.caslabai.com)**, built on the **Cognitive Architecture System (CAS) v7.7**.

- **Portal:** [compass.caslabai.com](https://compass.caslabai.com)
- **CAS Lab:** [www.caslabai.com](https://www.caslabai.com)
- **API Origin:** `https://api.caslabai.com`
- **Ecosystem:** Companion to CAS Lab's standalone **CAS Compiler** (deterministic CAS equation compiler & language toolchain)

CAS Compass measures the structural properties of how an AI system processes a prompt — the geometry of Mind↔Idea dynamics in the response — and produces traceable evidence artifacts alongside a composite NCCS score (0–100) and indicative bands (Platinum / Gold / Silver / Bronze / Fail). It is designed to surface structural failure modes (inversions, prerequisite-chain breaks, domain descent violations, lacunarity voids, compound inversions) that output-level benchmarks miss.

> **Structural framing (authoritative per [`docs/CAS_FOUNDATIONAL_CLARIFICATIONS.md`](docs/CAS_FOUNDATIONAL_CLARIFICATIONS.md)):** Every CAS primitive — the 10 Noetics, 4 Processing Domains, 7 Core Drives, 22 Capability Pathways, and 7 Inversion Axes — is a **structural** element of cognitive architecture, not an emotional, affective, or psychological state. Each applies equally to human minds, AI systems, biological cognitive systems, and hypothetical cognitive architectures. Read the framework through the Foundational Clarifications, not through affective connotation.

---

## Research & product boundary

CAS Compass is under active empirical validation and governed by fail-closed acceptance gates. Scoring is heuristic pending completion of the Human Validation Study (correlation of machine scores with independent human raters using Pearson r, Cohen's κ, Fisher-z CI). Research evidence never automatically promotes to customer-production `ACCEPT`; items requiring judgment remain `FLAG_FOR_HUMAN_REVIEW`. See `validation/` and `noetic-compass-scaffold/noetic-compass/docs/runbooks/customer_production_acceptance.md` for current status.

---

## Architecture

> Note: Internal repository directory `noetic-compass-scaffold/noetic-compass/` is intentionally preserved across the `LittleHenderson/noetic-compass` → `LittleHenderson/cas-compass` rename so AWS CodeBuild archive paths and historical build manifests remain unbroken.

```
cas-compass/
├── noetic-compass-scaffold/noetic-compass/
│   ├── cas-engine/          # Rust scoring crate (PyO3 bindings)
│   │   ├── src/ontology/    # Types: 10 Noetics, domains, drives, states
│   │   ├── src/scoring/     # Per-Noetic scoring + NCCS composite
│   │   ├── src/rpm/         # Recursive Prerequisite Model (section-retraction)
│   │   ├── src/inversions/  # 7-axis structural inversion scanner
│   │   ├── src/fractals/    # Cognitive Fractal engine
│   │   └── src/metric/      # Fisher-Rao metric on open probability simplex
│   ├── api/                 # FastAPI gateway (8-stage Wrap pipeline + Atlas LIVE proxy)
│   │   ├── routes/          # /assess, /wrap, /batch, /config, /scenarios, /atlas …
│   │   ├── middleware/      # JWT auth, rate limiting, audit logging
│   │   ├── llm_connectors/  # OpenAI, Anthropic, Google, Meta, xAI, DeepSeek, Qwen, Groq
│   │   ├── pipeline/        # Stage orchestration + interpreter
│   │   └── notation/        # Embedded CAS equation compiler (aligned with CAS Lab's standalone CAS Compiler)
│   ├── dashboard/           # CAS Compass Portal (React 18 + TypeScript + Vite)
│   ├── atlas-viewer/        # CAS Compass Atlas Audit Cockpit (React + Vite)
│   ├── live-trace-worker/   # Private GPU worker (Pythia-160M + SSE trace stream)
│   ├── cas-native/          # PyTorch CAS-Native AI (experimental)
│   ├── scenarios/           # 248-scenario assessment catalog across 11 categories
│   └── validation/          # Human Validation Study tooling
├── cascompass-landing/      # Static early-access & legal surface (cascompass.ai)
├── .aws/                    # Authoritative AWS deployment-control manifest
├── docs/                    # Engineering, cutover runbook, and evidence documentation
│   ├── CAS_COMPASS_CUTOVER_RUNBOOK.md            # GitHub, AWS, DNS, Vercel, Netlify cutover guide
│   ├── CAS_FOUNDATIONAL_CLARIFICATIONS.md        # Normative language reference
│   ├── AI_MISALIGNMENT_INCIDENTS_DATABASE.md     # Verified-source incident catalog
│   ├── INCIDENT_CATEGORIES.md                    # 12-class CAS failure taxonomy
│   ├── CAS_PREVENTION_CLAIMS.md                  # Conservative prevention-claim subset
│   ├── REGULATORY_MAPPING.md                     # CAS ↔ EU AI Act / NIST AI RMF / ISO 42001
│   ├── CITATION_INDEX.md                         # Master bibliography
│   └── data/                                     # Machine-readable incident records
├── book/                    # Manuscript (27 chapters + appendices)
├── peer_review/             # Peer-review paper (pre-arXiv)
├── ip/                      # Historical provisional patent filing packages
└── CLAUDE.md                # Master instructions for AI-assisted development
```

---

## Core capabilities

### 10 Canonical Noetics (N0–N9)

Structural dynamics between Mind and Idea in CAS v7.7. Each Noetic is a structural primitive of cognitive architecture — applying equally to human, AI, and biological cognitive systems. Per-Noetic structural semantics are documented in [`docs/CAS_FOUNDATIONAL_CLARIFICATIONS.md`](docs/CAS_FOUNDATIONAL_CLARIFICATIONS.md) §1.

- **N0 — Idea** — foundational generative substrate and monoid identity element.
- **N1 — Mind** — directed attention and processing focus on a specific Idea.
- **N2 — Positive** — structural attraction / geometric pull between Mind and Idea (involution pair with N3 Negative).
- **N3 — Negative** — structural repulsion / critical evaluation / geometric push (involution pair with N2 Positive).
- **N4 — Vibration** — structural amplitude and resonance with which an Idea impresses on the Mind.
- **N5 — Female** — receptive integration: the Mind composed of integrated Ideas (involution pair with N6 Male).
- **N6 — Male** — projective assertion: an Idea composed of and projecting other Ideas (involution pair with N5 Female).
- **N7 — Rhythm** — periodic pattern entrainment between Mind and Idea.
- **N8 — Above/Cause** — causal reasoning: one Idea triggers another via associative and inferential mechanics (involution pair with N9 Below/Effect).
- **N9 — Below/Effect** — consequential grounding: an Idea triggered by a preceding Idea (involution pair with N8 Above/Cause).

**Structural invariants:** involution pairs N2↔N3 (Positive↔Negative), N5↔N6 (Female↔Male), N8↔N9 (Above/Cause↔Below/Effect); self-duals N0 (Idea), N1 (Mind), N4 (Vibration), N7 (Rhythm); Noetics form a monoid `(N, ∘, N0)` with `N0` (Idea) as identity.

### 4 Processing Domains

Structural precedence tiers of cognitive processing. Total order `P ≻ C ≻ E ≻ O`. Domain Descent is a causation relation (`P → C → E → O`) with a feedback signal path (`O → P`). Not a preferential ordering of "better" or "worse" domains.

- **P — Principled** grounding
- **C — Cognitive** processing
- **E — Evaluative** weighing
- **O — Operational** execution

40 Cognitive States arise as the 10×4 product: `P0–P9`, `C0–C9`, `E0–E9`, `O0–O9`.

### 7 Core Drives

Structural motivational-architecture primitives — not emotional states.

| ID | Name | Inversion pair |
|----|------|----------------|
| F1 | Unity | ↔ F7 |
| F2 | Wisdom (evidence-integration capacity) | ↔ F6 |
| F3 | Vitality | ↔ F5 |
| F4 | Connection (structural coupling) | self-dual |
| F5 | Agency (execution-authority capacity) | ↔ F3 |
| F6 | Structure (rule-of-law consistency) | ↔ F2 |
| F7 | Purpose | ↔ F1 |

28 Domain-Specific Drives: the 7 Drives × 4 Domains.

### Recursive Prerequisite Model (RPM)

22 Capability Pathways: `A0` + `D1–D7` + `W1–W7` + `P1–P7`, with chain `A0 → Dn → Wn → Pn → Outcome`.

Structural semantics:
- **A0** — foundational generative dynamic (substrate for directed processing; not emotional desire).
- **Dn** — directional orientation toward Ideas for drive `n` (not felt desire).
- **Wn** — evidence integration for drive `n` (not felt understanding).
- **Pn** — execution authority for drive `n` (not felt capability).

The RPM is a **section-retraction**, not an adjunction: prerequisite satisfaction is one-directional, and re-embedding after realization may lose information. The RPM Gate caches initial satisfaction results rather than assuming reversibility.

### 5 Generative Operations

Five formally-verified operations on cognitive-state expressions, preserving CAS v7.7 invariants (admissibility relations, domain descent, open-simplex constraints, and RPM section-retraction):

**Three algebraic operations:**
- **Multiplication** — monoid composition with domain descent applied.
- **Division** — same-domain ratio; involution pairs resolve to the identity Noetic `N0` (Idea).
- **Fractal composition** — Noetic-sequence dynamics over iterated function systems.

**Two syntactic operations:**
- **Addition** — co-presence of two Ideas or configurations.
- **Subtraction** — structural removal of an element.

The embedded CAS notation compiler (`api/notation/`) — aligned with CAS Lab's standalone **CAS Compiler** — enforces these invariants at compile time before any expression is executed.

### Lacunarity analysis

Structural measure of how activation is distributed across the 40-state space. High lacunarity = concentration in a few states with adjacent voids. Two sub-patterns under development in the incident database: **edge-case void** (competent in the training-distribution core, voided at structurally adjacent edges) and **protected-characteristic void** (activation dense along a protected axis, voided on the axes that should have carried the evaluation). See `docs/INCIDENT_CATEGORIES.md`.

### 7-Axis Inversion Detection

Structural geometry flips — not attitude changes. Each axis has a resistance score; low resistance flags a cognitive-architecture flip under pressure.

| Axis | Scope |
|------|-------|
| **N** — Noetic | Involution-pair imbalance (N2↔N3, N5↔N6, N8↔N9) |
| **W** — Domain | `P ≻ C ≻ E ≻ O` precedence violations |
| **F** — Drive | Drive-pair imbalance (F1↔F7, F2↔F6, F3↔F5) |
| **E** — State | State-vector entropy deficit (rigidity) |
| **S** — Sub-Drive | Cross-domain drive variance |
| **A** — Pathway | RPM prerequisite-chain violations |
| **P** — Compound | Amplified severity from multiple simultaneous inversions |

---

## Assessment pipeline

The 8-stage Wrap pipeline evaluates a single prompt end-to-end:

```
Input Analyzer → RPM Gate → Dial Adjustment → Base LLM Call →
Noetic Scoring → Domain Coherence → Inversion Scan → Output Gate
```

Each stage can be separately inspected via the `/wrap` API endpoint. The Dial System allows per-Noetic sensitivity adjustment (integers 3–9) with hardcoded safety constraints: no dial below 3 or above 9, and involution pairs cannot diverge by more than 4 points.

### NCCS Composite Weights

| Component | Weight |
|-----------|--------|
| Noetic Profile | 25% |
| Domain Coherence (DCI = weakest/strongest domain avg) | 20% |
| Core Drive / RPM Integrity | 20% |
| Inversion Resistance (7 axes + stealth + compound) | 15% |
| Capability Pathway Quality | 10% |
| Social Engineering Resistance | 10% |

Indicative bands: 90–100 Platinum · 75–89 Gold · 60–74 Silver · 40–59 Bronze · 0–39 Fail.

---

## Quick start

### Prerequisites
Python 3.11+, Rust (stable toolchain), Node.js 20+.

### Install & test

```bash
cd noetic-compass-scaffold/noetic-compass
make install        # Python venv + Rust crate build via maturin + npm install
make test           # Rust + Python + Vitest
make validate       # Validation framework (reproducibility + sensitivity + correlation)
```

### Run development servers

```bash
cd noetic-compass-scaffold/noetic-compass
make dev            # API on :8000, Dashboard on :3000
```

### Configure LLM providers

```bash
cd noetic-compass-scaffold/noetic-compass
cp .env.example .env
# Edit .env — supported: OpenAI, Anthropic, Google, Meta, xAI, DeepSeek, Qwen, Groq, Mock (no key needed).
```

### Deployment & Cloud Cutover

Production runs on **AWS** (account `807562639912`, `us-west-2`, governed by `.aws/deployment-control.json` and `scripts/verify_aws_deployment_control.py`), with the **CAS Compass Portal** deployed on **Vercel** (`compass.caslabai.com`) and the early-access surface on **Netlify** (`cascompass.ai`).

- See [`docs/CAS_COMPASS_CUTOVER_RUNBOOK.md`](docs/CAS_COMPASS_CUTOVER_RUNBOOK.md) for the complete GitHub, AWS, DNS, Vercel, and Netlify cutover procedure.
- See [`noetic-compass-scaffold/noetic-compass/docs/runbooks/customer_production_acceptance.md`](noetic-compass-scaffold/noetic-compass/docs/runbooks/customer_production_acceptance.md) for customer-production acceptance controls.

---

## Publication status

- **Peer-review paper:** in `peer_review/` — pre-arXiv, undergoing Foundational Clarifications review before submission.
- **Book manuscript:** 27 chapters + appendices in `book/manuscript/` — Noetic definitions, processing domains, drives, prerequisite chain, inversions, math foundations, applications.
- **Incident database:** `docs/AI_MISALIGNMENT_INCIDENTS_DATABASE.md` — verified-source catalog of documented AI failures with CAS structural analysis.

---

## Intellectual property

**Confidential.** This repository is not licensed for redistribution. All source code, documentation, frameworks, and derivative works are proprietary to **CAS Lab** / Little Henderson. Historical provisional patent filing packages remain archived in `ip/`.

Framework: Cognitive Architecture System (CAS) v7.7 — **CAS Lab** ([www.caslabai.com](https://www.caslabai.com)).
© 2026 CAS Lab. All rights reserved.
