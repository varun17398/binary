const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 1024;

// Normalize Anthropic's stream into provider-agnostic events:
//   { type: 'text', text }
//   { type: 'usage', inputTokens, outputTokens }
async function* normalizeStream(rawStream) {
  let inputTokens = null;
  for await (const chunk of rawStream) {
    if (chunk.type === 'message_start') {
      inputTokens = chunk.message?.usage?.input_tokens ?? null;
    }
    if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
      yield { type: 'text', text: chunk.delta.text };
    }
    if (chunk.type === 'message_delta') {
      yield { type: 'usage', inputTokens, outputTokens: chunk.usage?.output_tokens ?? null };
    }
  }
}

async function send(messages, { stream = false, model = DEFAULT_MODEL, maxTokens = DEFAULT_MAX_TOKENS } = {}) {
  const params = { model, max_tokens: maxTokens, messages };
  if (stream) {
    const raw = client.messages.stream(params);
    return normalizeStream(raw);
  }
  return client.messages.create(params);
}

module.exports = { send, name: 'claude', displayName: 'Claude (Anthropic)', defaultModel: DEFAULT_MODEL };
