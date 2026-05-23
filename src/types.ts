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
};

declare global {
  interface Window {
    questBridge?: {
      saveQuest: (quest: QuestGuide) => Promise<{ ok: boolean }>;
      loadQuest: () => Promise<QuestGuide | null>;
      importQuest: (source: string) => Promise<QuestGuide>;
      toggleAlwaysOnTop: () => Promise<boolean>;
      minimize: () => Promise<void>;
      close: () => Promise<void>;
    };
  }
}
