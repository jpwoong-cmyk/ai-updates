export const MINI_AI_CHATBOT_CONFIG = {
  apiEndpoint: "/api/mini-ai-chat",

  // Existing Mini AI Encyclopedia provider dock.
  dockSelector: "#providerRobotDock",

  floatingLauncher: true,

  // Position of rebuilt companion above the provider dock.
  dockGapPx: 10,

  // Keep the slow rebuild, but the visual is now a smaller AI dot-matrix robot.
  pixelBuildDurationMs: 1700,
  pixelDisassembleDurationMs: 320,

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

  // Comic-style helper bubble
  helperBubbleText: "Chat with me!",

  // Client keeps only a short conversation tail. Evidence is retrieved fresh per question.
  maxClientHistoryMessages: 8
};
