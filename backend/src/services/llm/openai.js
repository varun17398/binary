const OpenAI = require('openai');

const DEFAULT_MODEL = 'gpt-4o-mini';

let client = null;
function getClient() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

async function* normalizeStream(rawStream) {
  let inputTokens = null;
  let outputTokens = null;
  for await (const chunk of rawStream) {
    const text = chunk.choices?.[0]?.delta?.content;
    if (text) yield { type: 'text', text };
    if (chunk.usage) {
      inputTokens = chunk.usage.prompt_tokens;
      outputTokens = chunk.usage.completion_tokens;
      yield { type: 'usage', inputTokens, outputTokens };
    }
  }
  // OpenAI only sends usage in the final chunk with stream_options
  if (inputTokens === null) {
    yield { type: 'usage', inputTokens: null, outputTokens: null };
  }
}

async function send(messages, { stream = false, model = DEFAULT_MODEL, maxTokens = 1024 } = {}) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
  const openai = getClient();
  const params = {
    model,
    max_tokens: maxTokens,
    messages,
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
  };
  if (stream) {
    const raw = await openai.chat.completions.create(params);
    return normalizeStream(raw);
  }
  return openai.chat.completions.create(params);
}

module.exports = { send, name: 'openai', displayName: 'GPT-4o mini (OpenAI)', defaultModel: DEFAULT_MODEL };
