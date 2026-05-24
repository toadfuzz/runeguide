import { useEffect, useState, useRef, useCallback } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpenText, ChevronRight,
  Compass, Download, Inbox, LoaderCircle, Minimize2, Moon, Pin,
  PinOff, Plus, Search, Sparkles, Sun, Sword, Trash2, X,
} from 'lucide-react';
import type { QuestGuide, QuestStep } from './types';

const defaultGuide: QuestGuide = { title: 'No quest loaded', sourceUrl: '', sections: [], steps: [] };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function accentColor(kind: QuestStep['kind']) {
  switch (kind) {
    case 'movement':    return 'var(--accent)';
    case 'dialogue':    return '#c5d8ff';
    case 'interaction': return 'var(--accent-2)';
    case 'action':      return 'var(--danger)';
    default:            return 'var(--muted)';
  }
}

function stepIcon(kind: QuestStep['kind']) {
  switch (kind) {
    case 'movement':    return '🏃';
    case 'dialogue':    return '💬';
    case 'interaction': return '🖱';
    case 'action':      return '⚔';
    default:            return '•';
  }
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function TitleBar({ isOnTop, onToggle, onTheme, theme }: {
  isOnTop: boolean; onToggle: () => void; onTheme: () => void; theme: string;
}) {
  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <Sword className="h-4 w-4 text-[var(--accent)]" />
        <span className="text-sm font-semibold tracking-wide">RuneGuide</span>
      </div>
      <div className="titlebar-controls">
        <button className="titlebar-btn" onClick={onTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button className={`titlebar-btn ${isOnTop ? 'active' : ''}`} onClick={onToggle} title={isOnTop ? 'Unpin' : 'Pin'}>
          {isOnTop ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        </button>
        <button className="titlebar-btn" onClick={() => window.questBridge?.minimize()} title="Minimize">
          <Minimize2 className="h-4 w-4" />
        </button>
        <button className="titlebar-btn close" onClick={() => window.questBridge?.close()} title="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SearchBar({ query, setQuery, suggestions, onSearch, loading }: {
  query: string; setQuery: (v: string) => void;
  suggestions: string[]; onSearch: () => void; loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function pick(title: string) {
    setQuery(title);
    setOpen(false);
  }

  return (
    <div className="panel rounded-[28px] p-5" ref={ref}>
      <div className="flex gap-4 lg:items-end lg:flex-row flex-col">
        <div className="relative flex-1 w-full">
          <span className="mb-2 block text-sm font-medium text-[var(--muted)]">RuneWiki quest name</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <input
              className="input pl-11"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              placeholder="e.g. Desert Treasure, The Knight's Sword…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); onSearch(); setOpen(false); }
                else if (e.key === 'ArrowDown') { e.preventDefault(); (ref.current?.querySelector('.suggestion') as HTMLElement)?.focus(); }
                else if (e.key === 'Escape') setOpen(false);
              }}
              onFocus={() => setOpen(true)}
              id="quest-input"
            />
            {query && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]" onClick={() => setQuery('')}>
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {open && suggestions.length > 0 && (
            <ul className="suggestions-list">
              {suggestions.map((s, i) => (
                <li key={s}>
                  <button className="suggestion w-full text-left" tabIndex={0}
                    onMouseDown={() => pick(s)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') pick(s);
                      else if (e.key === 'ArrowDown') { e.preventDefault(); (e.currentTarget.parentElement?.nextElementSibling?.querySelector('.suggestion') as HTMLElement)?.focus(); }
                      else if (e.key === 'ArrowUp') { e.preventDefault(); if (i === 0) (ref.current?.querySelector('.input') as HTMLElement)?.focus(); else (e.currentTarget.parentElement?.previousElementSibling?.querySelector('.suggestion') as HTMLElement)?.focus(); }
                    }}>
                    <Search className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
                    <span>{s}</span>
                    <ChevronRight className="ml-auto h-3 w-3 text-[var(--muted)]" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex gap-3 lg:flex-none">
          <button className="button primary" onClick={onSearch} disabled={loading || !query.trim()}>
            {loading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Import
          </button>
        </div>
      </div>
    </div>
  );
}

function StepList({ steps, current, onSelect }: {
  steps: QuestStep[]; current: number; onSelect: (i: number) => void;
}) {
  return (
    <div className="panel rounded-[28px] p-5 h-full overflow-hidden flex flex-col">
      <div className="badge mb-4 shrink-0"><BookOpenText className="h-4 w-4" />All Steps</div>
      <div className="overflow-y-auto flex-1 pr-1 -mr-1 space-y-2" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--line) transparent' }}>
        {steps.map((step, i) => (
          <button
            key={`${step.text}-${i}`}
            onClick={() => onSelect(i)}
            className={`step text-left w-full ${i === current ? 'active' : ''} ${i < current ? 'past' : ''}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">{stepIcon(step.kind)}</span>
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: accentColor(step.kind) }}>{step.kind}</span>
              {i < current && <span className="ml-auto text-xs text-[var(--accent)]">✓</span>}
              {i === current && <span className="ml-auto text-xs text-[var(--muted)]">→</span>}
            </div>
            <p className={`text-sm leading-relaxed ${i < current ? 'text-[var(--muted)] line-through' : ''}`}>{step.text}</p>
          </button>
        ))}
        {steps.length === 0 && (
          <p className="text-sm text-[var(--muted)] text-center py-8">No steps. Import a quest above.</p>
        )}
      </div>
    </div>
  );
}

function CurrentStepCard({ step, index, total, onPrev, onNext }: {
  step: QuestStep | null; index: number; total: number; onPrev: () => void; onNext: () => void;
}) {
  return (
    <section className="panel rounded-[28px] p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="badge"><Compass className="h-4 w-4" />Current Step</div>
        {total > 0 && <span className="text-sm text-[var(--muted)]">{index + 1} of {total}</span>}
      </div>

      {step ? (
        <>
          <div className="rounded-full h-2.5 bg-[rgba(255,255,255,0.06)] overflow-hidden border border-[rgba(255,255,255,0.06)]">
            <div className="h-full transition-all duration-500 rounded-full" style={{ width: `${total > 0 ? Math.round(((index + 1) / total) * 100) : 0}%`, background: 'linear-gradient(90deg, var(--accent), var(--accent-2))' }} />
          </div>

          <div className="mt-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">{stepIcon(step.kind)}</span>
              <span className="text-xs font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full border" style={{ color: accentColor(step.kind), borderColor: accentColor(step.kind) + '44' }}>
                {step.kind}
              </span>
            </div>
            <p className="text-xl leading-relaxed">{step.text}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button className="button secondary" onClick={onPrev} disabled={index === 0}>
                <ArrowLeft className="mr-2 h-4 w-4" />Back
              </button>
              <button className="button primary" onClick={onNext} disabled={index >= total - 1}>
                Next step<ArrowRight className="ml-2 h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex h-32 items-center justify-center text-[var(--muted)] text-sm">
          Import a quest to see your current step here.
        </div>
      )}
    </section>
  );
}

function SavedQuests({ quests, onSelect, onDelete }: {
  quests: QuestGuide[]; onSelect: (q: QuestGuide) => void; onDelete: (t: string) => void;
}) {
  return (
    <div className="panel rounded-[28px] p-5">
      <div className="badge mb-4"><Inbox className="h-4 w-4" />Saved ({quests.length})</div>
      {quests.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No saved quests yet.</p>
      ) : (
        <ul className="space-y-2">
          {quests.map((q) => (
            <li key={q.title} className="flex items-center gap-2 rounded-2xl bg-[rgba(255,255,255,0.03)] p-3 group">
              <button className="flex-1 text-left text-sm font-medium hover:text-[var(--accent)] transition" onClick={() => onSelect(q)}>
                <div className="flex items-center gap-2"><Sword className="h-3.5 w-3.5 text-[var(--accent)]" />{q.title}</div>
                <div className="mt-0.5 text-xs text-[var(--muted)]">{q.steps.length} steps</div>
              </button>
              <button className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-[var(--danger)] transition" onClick={() => onDelete(q.title)} title="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [guide, setGuide] = useState<QuestGuide>(defaultGuide);
  const [savedQuests, setSavedQuests] = useState<QuestGuide[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Paste a RuneWiki quest title to begin.');
  const [isOnTop, setIsOnTop] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved quests on mount
  useEffect(() => {
    window.questBridge?.loadQuests().then(setSavedQuests).catch(() => {});
  }, []);

  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCurrentStep(s => Math.min(guide.steps.length - 1, s + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentStep(s => Math.max(0, s - 1));
      } else if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        document.getElementById('quest-input')?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guide.steps.length]);

  // Live search suggestions
  const handleQueryChange = useCallback((val: string) => {
    setQuery(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (val.length < 2) { setSuggestions([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await window.questBridge?.searchQuests(val);
        setSuggestions(Array.isArray(results) ? results : []);
      } catch { setSuggestions([]); }
    }, 280);
  }, []);

  // Import quest
  async function importQuest() {
    if (!query.trim()) return;
    setLoading(true);
    setStatus('Fetching from RuneWiki…');
    try {
      const result = await (window.questBridge!.importQuest(query.trim()) as Promise<{ error?: string; guide?: QuestGuide }>);
      if (result.error) {
        setStatus(result.error);
        setLoading(false);
        return;
      }

      const imported = result?.guide;
      if (!imported?.steps?.length) {
        setStatus('No walkthrough found for this quest. Try the exact quest name.');
        setLoading(false);
        return;
      }

      setGuide(imported);
      setCurrentStep(0);
      setStatus(`Imported "${imported.title}" — ${imported.steps.length} steps.`);
      setSavedQuests(prev => {
        const filtered = prev.filter(q => q.title !== imported.title);
        return [imported, ...filtered].slice(0, 20);
      });
      await window.questBridge!.saveQuest(imported);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setLoading(false);
    }
  }

  function selectSaved(quest: QuestGuide) {
    setGuide(quest);
    setCurrentStep(0);
    setQuery(quest.title);
    setStatus(`Loaded "${quest.title}" from saved.`);
  }

  async function deleteSaved(title: string) {
    await window.questBridge?.deleteQuest(title);
    setSavedQuests(prev => prev.filter(q => q.title !== title));
    setStatus(`Deleted "${title}".`);
  }

  async function togglePin() {
    const result = await window.questBridge?.toggleAlwaysOnTop();
    if (typeof result === 'boolean') setIsOnTop(result);
  }

  function toggleTheme() {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }

  const total = guide.steps.length;
  const activeStep = guide.steps[currentStep] ?? null;

  return (
    <main className="app-shell">
      <div className="noise" />

      <TitleBar isOnTop={isOnTop} onToggle={togglePin} onTheme={toggleTheme} theme={theme} />

      <div className="mx-auto max-w-[1400px] px-4 pb-8 space-y-5 mt-12">

        {/* ── Header ── */}
        <header className="panel rounded-[28px] p-5 flex flex-col lg:flex-row gap-5 items-start lg:items-center justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl border border-[rgba(121,216,166,0.18)] bg-[rgba(121,216,166,0.06)] p-3">
              <Sword className="h-7 w-7 text-[var(--accent)]" />
            </div>
            <div>
              <div className="badge mb-3"><Sparkles className="h-4 w-4" />RuneScape 3 Quest Companion</div>
              <h1 className="title text-4xl sm:text-5xl">RuneGuide</h1>
              <p className="mt-1.5 text-sm text-[var(--muted)] max-w-xl leading-relaxed">
                Import any RuneScape wiki quest guide. Browse steps, track progress, and stay on route — without alt-tabbing to a browser.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm lg:min-w-[360px]">
            {[
              ['Quest', guide.title],
              ['Step', total ? `${currentStep + 1} / ${total}` : '0 / 0'],
              ['Progress', `${total > 0 ? Math.round(((currentStep + 1) / total) * 100) : 0}%`],
            ].map(([label, value]) => (
              <div key={label} className="panel-strong rounded-2xl p-3">
                <div className="muted text-xs">{label}</div>
                <div className="mt-1 font-semibold truncate">{value}</div>
              </div>
            ))}
          </div>
        </header>

        {/* ── Search ── */}
        <SearchBar query={query} setQuery={handleQueryChange} suggestions={suggestions} onSearch={importQuest} loading={loading} />

        {/* ── Status ── */}
        <div className="flex items-center gap-3 px-1">
          <div className="h-px flex-1 bg-[rgba(121,216,166,0.1)]" />
          <span className="text-xs text-[var(--muted)] px-3">{status}</span>
          <div className="h-px flex-1 bg-[rgba(121,216,166,0.1)]" />
        </div>

        {/* ── Main 3-column layout ── */}
        <div className="app-grid">

          {/* Left: all steps */}
          <div className="min-h-0">
            <StepList steps={guide.steps} current={currentStep} onSelect={setCurrentStep} />
          </div>

          {/* Center: current step */}
          <CurrentStepCard
            step={activeStep}
            index={currentStep}
            total={total}
            onPrev={() => setCurrentStep(s => Math.max(0, s - 1))}
            onNext={() => setCurrentStep(s => Math.min(total - 1, s + 1))}
          />

          {/* Right: saved + source */}
          <aside className="space-y-4">
            <SavedQuests quests={savedQuests} onSelect={selectSaved} onDelete={deleteSaved} />

            <section className="panel rounded-[28px] p-5">
              <div className="badge mb-4"><BookOpenText className="h-4 w-4" />Guide Source</div>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="muted text-xs mb-1">Title</div>
                  <div className="font-medium">{guide.title}</div>
                </div>
                <div>
                  <div className="muted text-xs mb-1">URL</div>
                  <div className="break-all text-[var(--muted)]">{guide.sourceUrl || '—'}</div>
                </div>
                {guide.sections.length > 0 && (
                  <div>
                    <div className="muted text-xs mb-2">Sections</div>
                    <div className="flex flex-wrap gap-1.5">
                      {guide.sections.map(s => (
                        <span key={s} className="rounded-full border border-[rgba(255,255,255,0.08)] px-2.5 py-0.5 text-xs text-[var(--muted)]">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="panel rounded-[28px] p-5">
              <div className="badge mb-3"><Sparkles className="h-4 w-4" />Shortcuts</div>
              <ul className="space-y-2 text-xs text-[var(--muted)] leading-relaxed">
                <li><kbd className="kbd">←</kbd> <kbd className="kbd">→</kbd> Navigate steps</li>
                <li><kbd className="kbd">Ctrl+F</kbd> Focus search</li>
                <li>Up to 20 quests saved locally</li>
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}