const claude = require('./claude');
const openai = require('./openai');

const providers = { claude, openai };

function getProvider(name = 'claude') {
  const provider = providers[name];
  if (!provider) throw new Error(`Unknown provider: ${name}. Available: ${Object.keys(providers).join(', ')}`);
  return provider;
}

function listProviders() {
  return Object.values(providers).map(p => ({ name: p.name, displayName: p.displayName, defaultModel: p.defaultModel }));
}

module.exports = { getProvider, listProviders };
