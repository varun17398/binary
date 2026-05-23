const PATTERNS = [
  { name: 'email',       re: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,           mask: '[EMAIL]'  },
  { name: 'phone',       re: /(\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/g,        mask: '[PHONE]'  },
  { name: 'ssn',         re: /\b\d{3}[\s\-]\d{2}[\s\-]\d{4}\b/g,                              mask: '[SSN]'    },
  { name: 'credit_card', re: /\b(?:\d{4}[\s\-]?){3}\d{4}\b/g,                                 mask: '[CARD]'   },
  { name: 'ip_address',  re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,                                  mask: '[IP]'     },
];

function redact(text) {
  if (!text || typeof text !== 'string') return text;
  let result = text;
  for (const { re, mask } of PATTERNS) {
    result = result.replace(re, mask);
  }
  return result;
}

function redactPayload(payload) {
  return {
    ...payload,
    inputPreview: redact(payload.inputPreview),
    outputPreview: redact(payload.outputPreview),
  };
}

module.exports = { redact, redactPayload };
