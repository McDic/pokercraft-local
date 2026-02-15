# Pokercraft Local: Web Migration Plan

> **Date**: 2026-02-15
> **Branch**: `feature/web-migration-20260215`
> **Goal**: Create a web version of Pokercraft Local using TypeScript + Rust/WASM, deployable on GitHub Pages

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Architecture](#current-architecture)
3. [Target Architecture](#target-architecture)
4. [Technology Stack](#technology-stack)
5. [Project Structure](#project-structure)
6. [Migration Phases](#migration-phases)
7. [Detailed Task Breakdown](#detailed-task-breakdown)
8. [Risk Assessment](#risk-assessment)
9. [Decisions Made](#decisions-made)

---

## Executive Summary

### Why Web?

- **No installation required** - Users can analyze poker data directly in browser
- **Cross-platform** - Works on any device with a modern browser
- **GitHub Pages deployment** - Free, reliable hosting with CI/CD
- **Privacy preserved** - All processing happens client-side, no data leaves the browser

### Approach

- **Rust → WASM** for heavy computation (equity, bankroll simulation, luck scoring)
- **TypeScript** for UI, file parsing, and visualization
- **Plotly.js** for interactive charts (same library, JavaScript version)
- **Monorepo structure** to share Rust code between Python and Web targets

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Python Application                        │
├─────────────────────────────────────────────────────────────┤
│  GUI (tkinter)          │  CLI (argparse)                   │
├─────────────────────────────────────────────────────────────┤
│  Visualization          │  Parsing         │  Export         │
│  - plotly               │  - parser.py     │  - HTML output  │
│  - pandas               │  - regex         │                 │
│  - statsmodels          │                  │                 │
├─────────────────────────────────────────────────────────────┤
│                    Rust (via PyO3/maturin)                   │
│  - card.rs      (card representation, hand ranking)         │
│  - equity.rs    (equity calculation, luck scoring)          │
│  - bankroll.rs  (Monte Carlo bankruptcy simulation)         │
│  - utils.rs     (combinatorics, helpers)                    │
└─────────────────────────────────────────────────────────────┘
```

### Current File Inventory

| File | Purpose | Lines (approx) | Web Migration |
|------|---------|----------------|---------------|
| `parser.py` | Parse GG Poker files | ~800 | Port to TypeScript |
| `data_structures.py` | Tournament/Hand data classes | ~600 | Port to TypeScript |
| `visualize/tourney_summary.py` | Tournament charts | ~900 | Port to TypeScript + Plotly.js |
| `visualize/hand_history.py` | Hand history charts | ~700 | Port to TypeScript + Plotly.js |
| `translate.py` | i18n support | ~200 | Port to TypeScript |
| `gui.py` | Tkinter GUI | ~800 | Replace with web UI |
| `pokercraft_local_rust/*.rs` | Rust computation | ~1200 | Compile to WASM |

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser Application                       │
├─────────────────────────────────────────────────────────────┤
│  UI Layer (TypeScript + Framework)                          │
│  - File upload/drag-drop                                    │
│  - Settings panel                                           │
│  - Results display                                          │
├─────────────────────────────────────────────────────────────┤
│  Application Layer (TypeScript)                             │
│  - parser/           File parsing (port from Python)        │
│  - visualization/    Plotly.js charts                       │
│  - analytics/        Data transformations (cumsum, etc.)    │
│  - i18n/             Translations                           │
├─────────────────────────────────────────────────────────────┤
│  Computation Layer (Rust → WASM)                            │
│  - Card operations                                          │
│  - Equity calculation                                       │
│  - Bankroll Monte Carlo                                     │
│  - Luck scoring (FFT-based)                                 │
└─────────────────────────────────────────────────────────────┘

Deployment: GitHub Pages (static files only)
```

---

## Technology Stack

### Frontend

| Category | Choice | Rationale |
|----------|--------|-----------|
| Language | **TypeScript** | Type safety, better tooling |
| Build Tool | **Vite** | Fast dev server, easy WASM integration |
| UI Framework | **React** | Most popular, largest ecosystem |
| Styling | **Tailwind CSS** | Rapid UI development |
| Charts | **Plotly.js** | Same as Python version, interactive |
| File Handling | **JSZip** | Extract .zip files client-side |
| State Management | **Zustand** | Lightweight, minimal boilerplate |

### Rust/WASM

| Category | Choice | Rationale |
|----------|--------|-----------|
| WASM Bindings | **wasm-bindgen** | Standard for Rust→WASM |
| Build Tool | **wasm-pack** | Streamlined WASM builds |
| Parallelism | **Single-threaded** (initially) | Simpler; Web Workers later if needed |

### Deployment

| Category | Choice | Rationale |
|----------|--------|-----------|
| Hosting | **GitHub Pages** | Free, integrated with repo |
| CI/CD | **GitHub Actions** | Automated builds and deployment |
| Domain | `mcdic.github.io/pokercraft-web` | Or custom domain |

---

## Project Structure

### Proposed Monorepo Layout

```
pokercraft_local/
├── .github/
│   └── workflows/
│       ├── python-ci.yml          # Existing Python CI
│       └── web-deploy.yml         # New: Build and deploy web app
│
├── Cargo.toml                     # Workspace root
│
├── crates/
│   ├── core/                      # Pure Rust logic (no bindings)
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── card.rs            # Card, Hand, HandRank
│   │       ├── equity.rs          # EquityResult, LuckCalculator
│   │       ├── bankroll.rs        # BankruptcyMetric, simulate()
│   │       └── utils.rs           # Combinatorics
│   │
│   ├── python-bindings/           # PyO3 wrapper
│   │   ├── Cargo.toml
│   │   └── src/lib.rs             # #[pyclass], #[pyfunction]
│   │
│   └── wasm-bindings/             # wasm-bindgen wrapper
│       ├── Cargo.toml
│       └── src/lib.rs             # #[wasm_bindgen]
│
├── pokercraft_local/              # Python package (existing)
│   ├── __init__.py
│   ├── rust/                      # -> crates/python-bindings
│   ├── parser.py
│   ├── data_structures.py
│   ├── visualize/
│   └── ...
│
├── web/                           # Web application (new)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── public/
│   │   └── preflop_cache.bin.gz   # Precomputed equity cache
│   └── src/
│       ├── main.ts                # Entry point
│       ├── App.tsx                # Root component
│       ├── components/            # UI components
│       │   ├── FileUploader.tsx
│       │   ├── SettingsPanel.tsx
│       │   └── ChartContainer.tsx
│       ├── parser/                # File parsing
│       │   ├── index.ts
│       │   ├── tournament.ts
│       │   └── hand-history.ts
│       ├── analytics/             # Data transformations
│       │   ├── historical.ts      # cumsum, rolling, etc.
│       │   └── statistics.ts      # OLS regression
│       ├── visualization/         # Plotly.js charts
│       │   ├── tourney-summary/
│       │   │   ├── historical-performance.ts
│       │   │   ├── rre-heatmap.ts
│       │   │   ├── bankroll-chart.ts
│       │   │   ├── prize-pies.ts
│       │   │   └── rr-by-rank.ts
│       │   └── hand-history/
│       │       ├── all-in-equity.ts
│       │       ├── chip-histories.ts
│       │       └── hand-usage.ts
│       ├── wasm/                  # WASM integration
│       │   └── index.ts           # Load and export WASM
│       ├── i18n/                  # Internationalization
│       │   ├── index.ts
│       │   ├── en.json
│       │   └── ko.json
│       └── types/                 # TypeScript types
│           ├── tournament.ts
│           └── hand-history.ts
│
├── pyproject.toml                 # Python build config (existing)
├── requirements.txt               # Python dependencies (existing)
└── docs/
    └── WEB_MIGRATION_PLAN.md      # This document
```

---

## Migration Phases

### Phase 0: Preparation (1-2 days)

- [ ] Restructure Rust code into workspace
- [ ] Verify Python bindings still work after restructure
- [ ] Set up basic web project skeleton

### Phase 1: WASM Foundation (3-5 days)

- [ ] Create `crates/core` with shared logic
- [ ] Create `crates/wasm-bindings` with wasm-bindgen
- [ ] Build and test WASM module locally
- [ ] Integrate WASM into Vite project

### Phase 2: Core TypeScript (5-7 days)

- [ ] Port `data_structures.py` to TypeScript types
- [ ] Port `parser.py` to TypeScript
- [ ] Implement file upload with JSZip extraction
- [ ] Add unit tests for parser

### Phase 3: Tournament Summary Charts (5-7 days)

- [ ] Port Historical Performance chart
- [ ] Port RRE Heatmap chart
- [ ] Port Bankroll Analysis chart (uses WASM)
- [ ] Port Prize Pies chart
- [ ] Port RR by Rank chart

### Phase 4: Hand History Charts (5-7 days)

- [ ] Port All-in Equity chart (uses WASM)
- [ ] Port Chip Histories chart
- [ ] Port Hand Usage Heatmaps chart

### Phase 5: UI Polish (3-5 days)

- [ ] Design and implement main UI layout
- [ ] Add settings panel (language, chart toggles)
- [ ] Implement progress indicators
- [ ] Add error handling and user feedback
- [ ] Mobile responsiveness

### Phase 6: Deployment (1-2 days)

- [ ] Set up GitHub Actions workflow
- [ ] Configure GitHub Pages
- [ ] Test production build
- [ ] Write user documentation

### Phase 7: Iteration (ongoing)

- [ ] Performance optimization
- [ ] Add Web Workers for heavy computation if needed
- [ ] User feedback and bug fixes

**Total Estimated Time: 4-6 weeks** (depending on complexity encountered)

---

## Detailed Task Breakdown

### Phase 0: Preparation

#### 0.1 Restructure Rust into Cargo Workspace

```toml
# Root Cargo.toml
[workspace]
resolver = "2"
members = [
    "crates/core",
    "crates/python-bindings",
    "crates/wasm-bindings",
]

[workspace.package]
version = "3.0.0"
edition = "2021"

[workspace.dependencies]
rand = "0.8"
rustfft = "6"
statrs = "0.18"
itertools = "0.14"
thiserror = "2.0"
```

#### 0.2 Extract Core Logic

Move from `pokercraft_local_rust/lib/` to `crates/core/src/`:
- `card.rs` - Remove `#[pyclass]`, `#[pymethods]`
- `equity.rs` - Remove PyO3 dependencies
- `bankroll.rs` - Remove PyO3 dependencies
- `utils.rs` - Keep as-is (no PyO3)

#### 0.3 Create Python Bindings Crate

```rust
// crates/python-bindings/src/lib.rs
use pyo3::prelude::*;
use pokercraft_core::{card, equity, bankroll};

#[pymodule]
fn pokercraft_local_rust(m: &Bound<'_, PyModule>) -> PyResult<()> {
    // Re-export with PyO3 wrappers
}
```

### Phase 1: WASM Foundation

#### 1.1 Create WASM Bindings Crate

```toml
# crates/wasm-bindings/Cargo.toml
[package]
name = "pokercraft-wasm"
version.workspace = true
edition.workspace = true

[lib]
crate-type = ["cdylib"]

[dependencies]
pokercraft-core = { path = "../core" }
wasm-bindgen = "0.2"
js-sys = "0.3"
serde = { version = "1.0", features = ["derive"] }
serde-wasm-bindgen = "0.6"
```

```rust
// crates/wasm-bindings/src/lib.rs
use wasm_bindgen::prelude::*;
use pokercraft_core::bankroll;

#[wasm_bindgen]
pub fn simulate_bankroll(
    initial_capital: f64,
    relative_returns: Vec<f64>,
    max_iteration: u32,
    simulation_count: u32,
) -> Result<JsValue, JsError> {
    let result = bankroll::simulate(...)?;
    Ok(serde_wasm_bindgen::to_value(&result)?)
}
```

#### 1.2 Build Script

```bash
# scripts/build-wasm.sh
cd crates/wasm-bindings
wasm-pack build --target web --out-dir ../../web/src/wasm/pkg
```

#### 1.3 Vite Configuration

```typescript
// web/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [react(), wasm()],
  base: '/pokercraft-web/', // GitHub Pages path
  build: {
    target: 'esnext',
  },
});
```

### Phase 2: TypeScript Parser

#### 2.1 Data Types

```typescript
// web/src/types/tournament.ts
export interface TournamentSummary {
  id: string;
  name: string;
  startTime: Date;
  buyIn: number;
  rake: number;
  myPrize: number;
  myRank: number;
  totalPlayers: number;
  totalPrizePool: number;
  myEntries: number;

  // Computed
  get profit(): number;
  get rre(): number;  // Relative Return of Entry
  get rrs(): number[]; // Relative Returns
}

export interface HandHistory {
  id: string;
  tournamentId: string | null;
  tournamentName: string;
  datetime: Date;
  knownCards: Map<string, [Card, Card]>;
  actions: Action[];
  // ...
}
```

#### 2.2 Parser Implementation

```typescript
// web/src/parser/tournament.ts
export async function parseTournamentFiles(
  files: File[]
): Promise<TournamentSummary[]> {
  const results: TournamentSummary[] = [];

  for (const file of files) {
    if (file.name.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file);
      // Extract and parse .txt files
    } else if (file.name.endsWith('.txt')) {
      const text = await file.text();
      results.push(...parseTournamentText(text));
    }
  }

  return results;
}

function parseTournamentText(text: string): TournamentSummary[] {
  // Port regex patterns from Python parser.py
  const tourneyPattern = /PokerStars Tournament #(\d+)/;
  // ...
}
```

### Phase 3-4: Visualization

#### Chart Implementation Pattern

```typescript
// web/src/visualization/tourney-summary/historical-performance.ts
import Plotly from 'plotly.js-dist-min';
import type { TournamentSummary } from '../../types/tournament';
import { cumsum, rollingMean } from '../../analytics/historical';
import { t } from '../../i18n';

export function renderHistoricalPerformance(
  container: HTMLElement,
  tournaments: TournamentSummary[],
  options: { windowSizes?: number[] } = {}
): void {
  const { windowSizes = [25, 100, 400, 800] } = options;

  // Calculate data series
  const profits = tournaments.map(t => t.profit);
  const netProfit = cumsum(profits);
  const maxProfit = cumulativeMax(netProfit);
  const drawdown = netProfit.map((v, i) => v - maxProfit[i]);

  // Build Plotly traces
  const traces: Plotly.Data[] = [
    {
      x: tournaments.map((_, i) => i + 1),
      y: netProfit,
      name: t('chart.netProfit'),
      mode: 'lines',
    },
    // ... more traces
  ];

  const layout: Partial<Plotly.Layout> = {
    title: t('chart.historicalPerformance.title'),
    // ...
  };

  Plotly.newPlot(container, traces, layout);
}
```

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Parser regex differences | Medium | Medium | Comprehensive test suite with real data |
| WASM bundle too large | Low | Low | Tree-shaking, lazy loading |
| Browser compatibility | Medium | Low | Target modern browsers only, polyfills |
| Plotly.js API differences | Low | Medium | Reference Plotly.js docs, test each chart |
| Performance issues | Medium | Medium | Profile early, Web Workers if needed |
| Preflop cache loading | Medium | Medium | Lazy load, compress with gzip |

---

## Decisions Made

> These decisions were finalized on 2026-02-15.

### 1. UI Framework: React

**Decision:** React with Vite

**Rationale:** Most widely used, largest ecosystem, extensive documentation and community support.

### 2. Chart Library: Plotly.js

**Decision:** Plotly.js

**Rationale:** Direct compatibility with existing Python charts, feature-rich, interactive.

### 3. State Management: Zustand

**Decision:** Zustand

**Rationale:** Simple, minimal boilerplate, works well with React.

### 4. Parallelism Strategy: Single-threaded (initially)

**Decision:** Start single-threaded, add Web Workers if needed

**Rationale:** Simpler implementation; optimize later if performance becomes an issue.

### 5. Python Codebase: Feature Freeze + Deprecation Path

**Decision:** Feature freeze Python, maintain for bug fixes only, eventual deprecation

**Rationale:** Web becomes the primary target. Python version survives for existing users but no new features.

### 6. Repository Structure: Monorepo

**Decision:** Keep everything in `pokercraft-local` repository

**Rationale:** Share Rust code between Python and WASM targets, single source of truth.

---

## Next Steps

1. **Review this plan** - Identify any missing requirements
2. **Answer open questions** - Make technology decisions
3. **Start Phase 0** - Restructure Rust workspace
4. **Create web project skeleton** - Initialize Vite + TypeScript

---

## Appendix A: Useful Resources

- [wasm-bindgen Guide](https://rustwasm.github.io/wasm-bindgen/)
- [wasm-pack Documentation](https://rustwasm.github.io/wasm-pack/)
- [Plotly.js Documentation](https://plotly.com/javascript/)
- [Vite WASM Plugin](https://github.com/prazdevs/vite-plugin-wasm)
- [JSZip Library](https://stuk.github.io/jszip/)

## Appendix B: Example GitHub Actions Workflow

```yaml
# .github/workflows/web-deploy.yml
name: Deploy Web App

on:
  push:
    branches: [main]
    paths:
      - 'web/**'
      - 'crates/**'

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown

      - name: Install wasm-pack
        run: cargo install wasm-pack

      - name: Build WASM
        run: |
          cd crates/wasm-bindings
          wasm-pack build --target web --out-dir ../../web/src/wasm/pkg

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: cd web && npm ci

      - name: Build web app
        run: cd web && npm run build

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./web/dist
```
