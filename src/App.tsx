import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpenText, Compass, Download, LoaderCircle, Sparkles, Sword } from 'lucide-react';
import type { QuestGuide, QuestStep } from './types';

const defaultGuide: QuestGuide = {
  title: 'No quest loaded',
  sourceUrl: '',
  sections: [],
  steps: []
};

function accentForStep(step: QuestStep) {
  switch (step.kind) {
    case 'movement':
      return 'text-[var(--accent)]';
    case 'dialogue':
      return 'text-[#c5d8ff]';
    case 'interaction':
      return 'text-[#d8b66f]';
    case 'action':
      return 'text-[#db7070]';
    default:
      return 'text-[var(--text)]';
  }
}

export default function App() {
  const [query, setQuery] = useState("The Knight's Sword");
  const [guide, setGuide] = useState<QuestGuide>(defaultGuide);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Paste a RuneWiki quest title or URL to begin.');
  const [savedName, setSavedName] = useState('');

  useEffect(() => {
    window.questBridge?.loadQuest().then((stored) => {
      if (stored) {
        setGuide(stored);
        setStatus(`Loaded saved guide for ${stored.title}.`);
      }
    });
  }, []);

  const activeStep = useMemo(() => guide.steps[currentStep] ?? null, [guide.steps, currentStep]);

  async function importGuide() {
    setLoading(true);
    setStatus('Fetching RuneWiki guide...');
    try {
      if (!window.questBridge?.importQuest) {
        throw new Error('Import bridge is unavailable in this preview.');
      }
      const imported = await window.questBridge.importQuest(query.trim());
      const normalized = {
        ...imported,
        steps: imported.steps.length ? imported.steps : [{ text: 'No guide steps were detected. Try another page.', kind: 'general' as const }]
      };
      setGuide(normalized);
      setCurrentStep(0);
      setStatus(`Imported ${normalized.steps.length} steps from RuneWiki.`);
      setSavedName(normalized.title);
      await window.questBridge.saveQuest(normalized);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setLoading(false);
    }
  }

  const progress = guide.steps.length ? Math.round(((currentStep + 1) / guide.steps.length) * 100) : 0;

  return (
    <main className="app-shell relative overflow-hidden">
      <div className="noise" />
      <div className="mx-auto max-w-[1450px] space-y-5">
        <header className="panel rounded-[28px] p-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl border border-[rgba(121,216,166,0.18)] bg-[rgba(121,216,166,0.06)] p-3">
              <Sword className="h-7 w-7 text-[var(--accent)]" />
            </div>
            <div>
              <div className="badge mb-3">
                <Sparkles className="h-4 w-4" />
                RuneScape 3 quest companion
              </div>
              <h1 className="title text-4xl sm:text-5xl">Quest Guide Overlay</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
                Import a RuneWiki quest, keep the current step pinned, and use movement cues to stay on track without feeling like you left the game.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:min-w-[470px]">
            <div className="panel-strong rounded-2xl p-3">
              <div className="muted">Quest</div>
              <div className="mt-1 font-semibold">{guide.title}</div>
            </div>
            <div className="panel-strong rounded-2xl p-3">
              <div className="muted">Step</div>
              <div className="mt-1 font-semibold">{guide.steps.length ? `${currentStep + 1}/${guide.steps.length}` : '0/0'}</div>
            </div>
            <div className="panel-strong rounded-2xl p-3">
              <div className="muted">Kind</div>
              <div className="mt-1 font-semibold">{activeStep?.kind ?? 'idle'}</div>
            </div>
            <div className="panel-strong rounded-2xl p-3">
              <div className="muted">Saved</div>
              <div className="mt-1 font-semibold">{savedName || 'none'}</div>
            </div>
          </div>
        </header>

        <section className="panel rounded-[28px] p-5">
          <div className="grid gap-4 lg:grid-cols-[1.1fr_auto_auto] lg:items-end">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--muted)]">RuneWiki quest title or URL</span>
              <input
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="https://runescape.wiki/... or Desert Treasure"
              />
            </label>
            <button className="button" onClick={importGuide} disabled={loading}>
              {loading ? <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" /> : <Download className="mr-2 inline h-4 w-4" />}
              Import guide
            </button>
            <div className="rounded-2xl border border-[rgba(121,216,166,0.14)] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm text-[var(--muted)]">
              {status}
            </div>
          </div>
        </section>

        <div className="grid-layout">
          <section className="panel rounded-[28px] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="badge">
                  <Compass className="h-4 w-4" />
                  Current route
                </div>
                <h2 className="title mt-3 text-2xl">Next movement cue</h2>
              </div>
              <div className="rounded-full border border-[rgba(121,216,166,0.16)] px-4 py-2 text-sm text-[var(--muted)]">
                {progress}% complete
              </div>
            </div>

            <div className="panel-strong rounded-[24px] p-5">
              {activeStep ? (
                <>
                  <div className={`text-sm font-semibold uppercase tracking-[0.2em] ${accentForStep(activeStep)}`}>
                    {activeStep.kind}
                  </div>
                  <p className="mt-3 text-xl leading-8">{activeStep.text}</p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button className="button secondary" onClick={() => setCurrentStep((v) => Math.max(0, v - 1))}>
                      Back
                    </button>
                    <button className="button" onClick={() => setCurrentStep((v) => Math.min(guide.steps.length - 1, v + 1))}>
                      Next step <ArrowRight className="ml-2 inline h-4 w-4" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-[var(--muted)]">Import a quest to see the current step here.</div>
              )}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {guide.steps.slice(0, 6).map((step, index) => (
                <button
                  key={`${step.text}-${index}`}
                  onClick={() => setCurrentStep(index)}
                  className={`step text-left transition hover:bg-[rgba(121,216,166,0.06)] ${index === currentStep ? 'active' : ''}`}
                >
                  <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${accentForStep(step)}`}>{step.kind}</div>
                  <div className="mt-2 text-sm leading-6 text-[var(--text)]">{step.text}</div>
                </button>
              ))}
            </div>
          </section>

          <aside className="space-y-5">
            <section className="panel rounded-[28px] p-5">
              <div className="badge">
                <BookOpenText className="h-4 w-4" />
                Guide source
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <div className="muted">Source URL</div>
                  <div className="break-all">{guide.sourceUrl || 'Not imported yet'}</div>
                </div>
                <div>
                  <div className="muted">Sections</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {guide.sections.length ? guide.sections.map((section) => (
                      <span key={section} className="rounded-full border border-[rgba(255,255,255,0.08)] px-3 py-1 text-xs text-[var(--muted)]">
                        {section}
                      </span>
                    )) : <span className="text-[var(--muted)]">None parsed yet</span>}
                  </div>
                </div>
              </div>
            </section>

            <section className="panel rounded-[28px] p-5">
              <div className="badge">
                <Sparkles className="h-4 w-4" />
                Parser notes
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
                RuneWiki pages are parsed heuristically right now. If the page format is weird, the next step is to tighten the extractor rather than pretending the wiki suddenly became tidy.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
