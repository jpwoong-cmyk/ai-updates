export const MINI_AI_CHATBOT_CONFIG = {
  apiEndpoint: "/api/mini-ai-chat",

  // Existing Mini AI Encyclopedia provider dock.
  dockSelector: "#providerRobotDock",

  // Floating launcher remains visible whenever the provider dock is hidden.
  floatingLauncher: true,

  // Position of the rebuilt pixel robot above the provider dock.
  dockGapPx: 14,

  // Slow reconstruction requested for the scroll state.
  pixelBuildDurationMs: 1900,
  pixelDisassembleDurationMs: 420,

  panelTitle: "Mini AI Encyclopedia",
  panelSubtitle: "Ask about AI product & developer updates",
  inputPlaceholder: "Ask about ChatGPT, Claude, Gemini or Copilot…",

  welcomeMessage:
    "Hey. I can answer from the AI updates indexed by this encyclopedia. Try “What changed with ChatGPT recently?”",

  suggestedQuestions: [
    "What's new with ChatGPT recently?",
    "What changed in the Gemini API?",
    "Compare recent Claude and OpenAI developer updates.",
    "Any recent Copilot deprecations?"
  ],

  // Client keeps only a short conversation tail. Evidence is retrieved fresh per question.
  maxClientHistoryMessages: 8
};
