export const MINI_AI_CHATBOT_CONFIG = {
  apiEndpoint: "/api/mini-ai-chat",
  dockSelector: "#providerRobotDock",
  floatingLauncher: true,

  dockGapPx: 8,

  dockBuildDurationMs: 1150,
  dockDisassembleDurationMs: 300,

  panelTitle: "Mini AI Encyclopedia",
  panelSubtitle: "Ask about AI product & developer updates",
  inputPlaceholder:
    "Ask about ChatGPT, Claude, Gemini, Copilot or Grok…",

  welcomeMessage:
    "Hey. I can answer from the AI updates indexed by this encyclopedia. Try “What changed with Grok recently?”",

  suggestedQuestions: [
    "What's new with ChatGPT recently?",
    "What's new with Grok?",
    "What changed in the xAI API?",
    "Compare recent Claude and OpenAI developer updates.",
    "Any recent Copilot deprecations?"
  ],

  helperBubbleText: "Chat with me!",

  helperBubbleInitialDelayMs: 2200,
  helperBubbleRepeatMs: 60000,
  helperBubbleTypeSpeedMs: 72,
  helperBubbleHoldMs: 2200,
  helperBubbleHideMs: 260,

  maxClientHistoryMessages: 8
};
