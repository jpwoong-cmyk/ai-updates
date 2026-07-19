/**
 * AI ENCYCLOPEDIA CONFIGURATION
 * ------------------------------------------------------------------
 * Each provider has a Product feed and a Developer feed.
 * The provider array remains the single source of truth for the UI.
 */

window.AI_ENCYCLOPEDIA_CONFIG = {
  "previewMode": true,
  "defaultTags": [
    "All changes",
    "New feature",
    "Model update",
    "API",
    "Improvement",
    "Fixed",
    "Deprecated",
    "Pricing",
    "Safety"
  ],
  "providers": [
    {
      "id": "openai",
      "name": "OpenAI",
      "product": "ChatGPT",
      "shortLabel": "ChatGPT",
      "initials": "OA",
      "accent": "#20b486",
      "description": "ChatGPT product updates and OpenAI developer platform releases.",
      "feeds": {
        "product": {
          "id": "openai_product_API",
          "product": "ChatGPT",
          "endpoint": "/api/openai"
        },
        "developer": {
          "id": "openai_developer_API",
          "product": "OpenAI Platform",
          "endpoint": "/api/openai-developer"
        }
      }
    },
    {
      "id": "anthropic",
      "name": "Anthropic",
      "product": "Claude",
      "shortLabel": "Claude",
      "initials": "AN",
      "accent": "#d18b5b",
      "description": "Claude product updates and Claude Platform developer releases.",
      "feeds": {
        "product": {
          "id": "anthropic_product_API",
          "product": "Claude",
          "endpoint": "/api/anthropic"
        },
        "developer": {
          "id": "anthropic_developer_API",
          "product": "Claude Platform",
          "endpoint": "/api/anthropic-developer"
        }
      }
    },
    {
      "id": "gemini",
      "name": "Google",
      "product": "Gemini",
      "shortLabel": "Gemini",
      "initials": "GG",
      "accent": "#6f8cff",
      "description": "Gemini app updates and Gemini API developer releases from Google.",
      "feeds": {
        "product": {
          "id": "gemini_product_API",
          "product": "Gemini",
          "endpoint": "/api/gemini"
        },
        "developer": {
          "id": "gemini_developer_API",
          "product": "Gemini API",
          "endpoint": "/api/gemini-developer"
        }
      }
    },
    {
      "id": "copilot",
      "name": "Microsoft",
      "product": "Microsoft 365 Copilot",
      "shortLabel": "Copilot",
      "initials": "MS",
      "colourMode": "palette",
      "accent": "#00A4EF",
      "palette": [
        "#F25022",
        "#7FBA00",
        "#00A4EF",
        "#FFB900"
      ],
      "description": "Microsoft 365 Copilot product updates and extensibility releases.",
      "feeds": {
        "product": {
          "id": "copilot_product_API",
          "product": "Microsoft 365 Copilot",
          "endpoint": "/api/copilot"
        },
        "developer": {
          "id": "copilot_developer_API",
          "product": "Microsoft 365 Copilot Extensibility",
          "endpoint": "/api/copilot-developer"
        }
      }
    }
  ]
};
