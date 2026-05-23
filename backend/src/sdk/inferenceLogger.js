const { v4: uuidv4 } = require('uuid');
const bus = require('../events/bus');

function publish(payload) {
  bus.publish('inference.log', payload);
}

function buildBase({ provider, model, conversationId, messages }) {
  return {
    logId: uuidv4(),
    provider: provider.name,
    model: model || provider.defaultModel,
    conversationId: conversationId || null,
    inputMessages: messages.length,
    inputPreview: messages[messages.length - 1]?.content?.slice(0, 200) ?? '',
    startedAt: new Date().toISOString(),
  };
}

// Wraps the normalized provider stream, captures usage/content metadata,
// and yields every event unchanged so the caller sees no difference.
async function* wrapStream(stream, base, startTime) {
  let inputTokens = null;
  let outputTokens = null;
  let fullContent = '';

  try {
    for await (const chunk of stream) {
      if (chunk.type === 'text') fullContent += chunk.text;
      if (chunk.type === 'usage') {
        inputTokens = chunk.inputTokens;
        outputTokens = chunk.outputTokens;
      }
      yield chunk;
    }

    publish({
      ...base,
      status: 'success',
      latencyMs: Date.now() - startTime,
      finishedAt: new Date().toISOString(),
      inputTokens,
      outputTokens,
      outputPreview: fullContent.slice(0, 200),
    });
  } catch (err) {
    publish({
      ...base,
      status: 'error',
      latencyMs: Date.now() - startTime,
      finishedAt: new Date().toISOString(),
      errorMessage: err.message,
    });
    throw err;
  }
}

async function loggedSend(provider, messages, options = {}) {
  const { conversationId, stream = false, model, ...rest } = options;
  const startTime = Date.now();
  const base = buildBase({ provider, model, conversationId, messages });

  if (stream) {
    const rawStream = await provider.send(messages, { stream, model, ...rest });
    return wrapStream(rawStream, base, startTime);
  }

  try {
    const response = await provider.send(messages, { stream, model, ...rest });
    publish({
      ...base,
      status: 'success',
      latencyMs: Date.now() - startTime,
      finishedAt: new Date().toISOString(),
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
      outputPreview: response.content?.[0]?.text?.slice(0, 200) ?? '',
    });
    return response;
  } catch (err) {
    publish({
      ...base,
      status: 'error',
      latencyMs: Date.now() - startTime,
      finishedAt: new Date().toISOString(),
      errorMessage: err.message,
    });
    throw err;
  }
}

module.exports = { loggedSend };
