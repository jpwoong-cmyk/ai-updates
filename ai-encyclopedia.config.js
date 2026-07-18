/**
 * AI ENCYCLOPEDIA CONFIGURATION
 * ------------------------------------------------------------------
 * This is the main file to edit when adding a new AI provider.
 *
 * To add another AI:
 * 1. Duplicate one provider object below.
 * 2. Give it a unique provider id and API id.
 * 3. Paste the future API URL into api.endpoint.
 *
 * Navigation, walking robots, filtering and empty states are generated automatically.
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
      "description": "ChatGPT, OpenAI models and platform updates.",
      "api": {
        "id": "openAI_API",
        "endpoint": ""
      },
      "previewEntries": [
        {
          "title": "Preview: ChatGPT workspace tools expanded",
          "date": "2026-07-16",
          "summary": "Example product update showing how a new workspace capability will appear in the changelog.",
          "tags": [
            "New feature",
            "Improvement",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: OpenAI model family refreshed",
          "date": "2026-07-13",
          "summary": "Example model release entry with a concise summary and multiple change categories.",
          "tags": [
            "Model update",
            "API",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Faster responses during peak hours",
          "date": "2026-07-09",
          "summary": "Example performance improvement for ChatGPT users during periods of heavier demand.",
          "tags": [
            "Improvement",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Structured output controls added",
          "date": "2026-07-04",
          "summary": "Example developer update introducing additional output-format controls for API workflows.",
          "tags": [
            "API",
            "New feature",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Conversation history reliability fix",
          "date": "2026-06-28",
          "summary": "Example fix describing improved loading and synchronization of conversation history.",
          "tags": [
            "Fixed",
            "Improvement",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Safety evaluation notes published",
          "date": "2026-06-22",
          "summary": "Example safety entry documenting updated evaluation coverage for a model release.",
          "tags": [
            "Safety",
            "Model update",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Legacy endpoint retirement notice",
          "date": "2026-06-17",
          "summary": "Example deprecation notice giving developers time to migrate from an older endpoint.",
          "tags": [
            "Deprecated",
            "API",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Team plan controls improved",
          "date": "2026-06-11",
          "summary": "Example administration update for workspace owners and team managers.",
          "tags": [
            "Improvement",
            "New feature",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Usage pricing table revised",
          "date": "2026-06-05",
          "summary": "Example pricing entry showing how cost changes will be summarized without replacing the official source.",
          "tags": [
            "Pricing",
            "API",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: File analysis support broadened",
          "date": "2026-05-29",
          "summary": "Example ChatGPT capability update covering additional document and data workflows.",
          "tags": [
            "New feature",
            "Improvement",
            "Preview"
          ],
          "sourceUrl": ""
        }
      ]
    },
    {
      "id": "anthropic",
      "name": "Anthropic",
      "product": "Claude",
      "shortLabel": "Claude",
      "initials": "AN",
      "accent": "#d18b5b",
      "description": "Claude product, model and developer platform updates.",
      "api": {
        "id": "anthropic_API",
        "endpoint": ""
      },
      "previewEntries": [
        {
          "title": "Preview: Claude project memory expanded",
          "date": "2026-07-15",
          "summary": "Example Claude workspace update showing a longer-running project context experience.",
          "tags": [
            "New feature",
            "Improvement",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Anthropic model release candidate",
          "date": "2026-07-11",
          "summary": "Example model announcement prepared for future normalized changelog data.",
          "tags": [
            "Model update",
            "Safety",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Tool-use latency reduced",
          "date": "2026-07-07",
          "summary": "Example performance improvement for Claude applications that call external tools.",
          "tags": [
            "API",
            "Improvement",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Workspace role controls added",
          "date": "2026-07-01",
          "summary": "Example organization feature for controlling who can manage shared Claude projects.",
          "tags": [
            "New feature",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Streaming response issue resolved",
          "date": "2026-06-26",
          "summary": "Example fix for interrupted or duplicated streamed responses in developer integrations.",
          "tags": [
            "Fixed",
            "API",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Updated responsible scaling notes",
          "date": "2026-06-20",
          "summary": "Example safety documentation entry linked to model deployment practices.",
          "tags": [
            "Safety",
            "Improvement",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Older SDK branch deprecated",
          "date": "2026-06-14",
          "summary": "Example migration notice for applications using an older Claude SDK branch.",
          "tags": [
            "Deprecated",
            "API",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Artifact editing workflow refined",
          "date": "2026-06-08",
          "summary": "Example product improvement for editing and iterating on generated artifacts.",
          "tags": [
            "Improvement",
            "New feature",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Batch processing price updated",
          "date": "2026-06-02",
          "summary": "Example pricing update for high-volume asynchronous processing workloads.",
          "tags": [
            "Pricing",
            "API",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Citation rendering improved",
          "date": "2026-05-27",
          "summary": "Example Claude response-quality update for clearer source references.",
          "tags": [
            "Improvement",
            "Fixed",
            "Preview"
          ],
          "sourceUrl": ""
        }
      ]
    },
    {
      "id": "gemini",
      "name": "Google",
      "product": "Gemini",
      "shortLabel": "Gemini",
      "initials": "GG",
      "accent": "#6f8cff",
      "description": "Gemini model, app and API updates from Google.",
      "api": {
        "id": "gemini_API",
        "endpoint": "/api/gemini"
      },
      "previewEntries": [
        {
          "title": "Preview: Gemini multimodal workspace expanded",
          "date": "2026-07-14",
          "summary": "Example Gemini app update showing broader image, document and audio workflows.",
          "tags": [
            "New feature",
            "Improvement",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Gemini model capability refresh",
          "date": "2026-07-10",
          "summary": "Example model update ready to be replaced by the future Gemini changelog endpoint.",
          "tags": [
            "Model update",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Function calling reliability improved",
          "date": "2026-07-06",
          "summary": "Example developer update for more consistent function selection and argument generation.",
          "tags": [
            "API",
            "Fixed",
            "Improvement",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Notebook integration added",
          "date": "2026-06-30",
          "summary": "Example feature allowing Gemini outputs to flow into a connected notebook workflow.",
          "tags": [
            "New feature",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Long-context upload issue fixed",
          "date": "2026-06-24",
          "summary": "Example fix for large uploaded files that previously failed during processing.",
          "tags": [
            "Fixed",
            "Improvement",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Model safety filters revised",
          "date": "2026-06-18",
          "summary": "Example safety update describing refinements to configurable content filters.",
          "tags": [
            "Safety",
            "Model update",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Experimental endpoint sunset announced",
          "date": "2026-06-12",
          "summary": "Example deprecation notice for a temporary Gemini API endpoint.",
          "tags": [
            "Deprecated",
            "API",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Shared Gems management improved",
          "date": "2026-06-06",
          "summary": "Example Gemini product update for organizing and sharing custom assistants.",
          "tags": [
            "Improvement",
            "New feature",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Cached-context pricing adjusted",
          "date": "2026-05-31",
          "summary": "Example pricing entry for developers using repeated context across requests.",
          "tags": [
            "Pricing",
            "API",
            "Preview"
          ],
          "sourceUrl": ""
        },
        {
          "title": "Preview: Search grounding citations refined",
          "date": "2026-05-25",
          "summary": "Example response-quality update improving the placement and clarity of grounded citations.",
          "tags": [
            "Improvement",
            "Fixed",
            "Preview"
          ],
          "sourceUrl": ""
        }
      ]
    }
  ]
};
