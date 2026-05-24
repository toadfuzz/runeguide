export type StepKind = 'movement' | 'dialogue' | 'interaction' | 'action' | 'general';

export type QuestStep = {
  text: string;
  kind: StepKind;
};

export type QuestGuide = {
  title: string;
  sourceUrl: string;
  sections: string[];
  steps: QuestStep[];
  savedAt?: number;
};

export type WindowBridge = {
  minimize: () => Promise<void>;
  close: () => Promise<void>;
  toggleAlwaysOnTop: () => Promise<boolean>;
  saveQuest: (quest: QuestGuide) => Promise<{ ok: boolean }>;
  loadQuests: () => Promise<QuestGuide[]>;
  deleteQuest: (title: string) => Promise<{ ok: boolean }>;
  importQuest: (query: string) => Promise<ImportResult>;
  searchQuests: (term: string) => Promise<string[]>;
  getPageUrl: (title: string) => Promise<string | null>;
};

export type ImportResult = {
  ok: boolean;
  error?: string;
};

declare global {
  interface Window {
    questBridge?: WindowBridge;
  }
}