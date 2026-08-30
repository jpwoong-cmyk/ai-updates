import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyChatQuestion
} from "../lib/mini-ai-chat/relevance.js";

import {
  rankItems
} from "../lib/mini-ai-chat/ranking.js";

test("social rubbish is rejected without AI", () => {
  const examples = [
    "I love you",
    "hello",
    "thanks",
    "tell me a joke",
    "12345"
  ];

  for (const question of examples) {
    const result =
      classifyChatQuestion(question, []);

    assert.equal(
      result.mode,
      "reject",
      question
    );
  }
});

test("provider-only chatter becomes a free hint", () => {
  const examples = [
    "ChatGPT",
    "I love Claude",
    "Grok is cool"
  ];

  for (const question of examples) {
    const result =
      classifyChatQuestion(question, []);

    assert.equal(
      result.mode,
      "hint",
      question
    );
  }
});

test("real encyclopedia questions pass", () => {
  const examples = [
    "What's new with ChatGPT?",
    "What changed in the Claude API recently?",
    "Any recent API deprecations?",
    "Compare Grok and Gemini updates",
    "What is Copilot?"
  ];

  for (const question of examples) {
    const result =
      classifyChatQuestion(question, []);

    assert.equal(
      result.mode,
      "allow",
      question
    );
  }
});

test("relevant follow-up can use recent conversation context", () => {
  const history = [
    {
      role: "user",
      content: "What's new with ChatGPT?"
    },
    {
      role: "assistant",
      content: "Here are recent ChatGPT updates."
    }
  ];

  const result =
    classifyChatQuestion(
      "What about pricing?",
      history
    );

  assert.equal(
    result.mode,
    "allow"
  );
});

test("ranking returns no evidence for a complete mismatch", () => {
  const items = [
    {
      providerId: "openai",
      providerName: "OpenAI",
      product: "ChatGPT",
      title: "New reasoning model",
      summary: "A new reasoning model is available.",
      tags: ["Model update"],
      date: "2026-08-20"
    }
  ];

  const results =
    rankItems(
      "banana sandwich",
      items
    );

  assert.deepEqual(
    results,
    []
  );
});

test("ranking still returns provider evidence for a real provider question", () => {
  const items = [
    {
      providerId: "openai",
      providerName: "OpenAI",
      product: "ChatGPT",
      title: "New reasoning model",
      summary: "A new reasoning model is available.",
      tags: ["Model update"],
      date: "2026-08-20"
    },
    {
      providerId: "anthropic",
      providerName: "Anthropic",
      product: "Claude",
      title: "Claude update",
      summary: "Claude received an update.",
      tags: ["Improvement"],
      date: "2026-08-21"
    }
  ];

  const results =
    rankItems(
      "What's new with ChatGPT?",
      items
    );

  assert.ok(
    results.length > 0
  );

  assert.equal(
    results[0].providerId,
    "openai"
  );
});
