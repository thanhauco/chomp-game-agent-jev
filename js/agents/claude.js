/* Claude agent: asks a Claude model for every move.
 *
 * Each turn the board is rendered as text and sent to the Messages API with a
 * JSON-schema output format, so the reply always has the same shape as the panel:
 * a move, a probability per legal move, and a one-sentence reason.
 *
 * The Anthropic TypeScript SDK is loaded on first use from jsDelivr's ESM build.
 * The API key is supplied by the viewer and only ever sent to api.anthropic.com. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});

  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.129.0/+esm';
  const MODELS = [
    { id: 'claude-opus-5', label: 'Claude Opus 5' },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ];
  const settings = { apiKey: '', model: 'claude-opus-5', effort: 'low' };

  const SYSTEM = [
    'You control the chomper in a maze-chase game. Each turn you see the board and pick one move.',
    'Goal: eat every pellet and survive. Touching a normal ghost costs a life.',
    'After a power pellet, frightened ghosts can be eaten for bonus points until the fright timer runs out.',
    'Rows and columns wrap around at the edges where the tunnel is open.',
    'Give a probability for every legal move saying how likely it is to be the best move (they should sum to 1),',
    'the move you choose, and a one-sentence reason.',
  ].join(' ');

  // The board as text. Ghosts are drawn by state, then listed with details.
  function boardText(game) {
    const s = game.s, m = game.maze;
    const grid = m.rows.map((r) => [...r].map((c) => (c === '#' ? '#' : c === '-' ? '-' : ' ')));
    for (let i = 0; i < s.pellets.length; i++) {
      if (s.pellets[i]) grid[(i / m.W) | 0][i % m.W] = s.pellets[i] === 2 ? 'o' : '.';
    }
    const ghostLines = [];
    for (const g of s.ghosts) {
      const name = C.GHOSTS[g.i].name;
      if (g.mode === 'house') { ghostLines.push(`- ${name}: waiting in the ghost house`); continue; }
      const state = g.mode === 'eaten' ? 'eaten, eyes returning home (harmless)' : g.scared ? 'frightened (edible)' : 'dangerous';
      grid[g.y][g.x] = g.mode === 'eaten' ? 'e' : g.scared ? 'f' : 'G';
      ghostLines.push(`- ${name} at (${g.x}, ${g.y}) heading ${g.dir}: ${state}`);
    }
    grid[s.pac.y][s.pac.x] = 'C';
    const legal = game.legal();
    return [
      `Board (${m.W} columns x ${m.H} rows; x grows right, y grows down):`,
      grid.map((r) => r.join('')).join('\n'),
      'Legend: C you, G dangerous ghost, f frightened ghost, e ghost eyes, . pellet, o power pellet, # wall, - ghost-house door.',
      `You are at (${s.pac.x}, ${s.pac.y}) heading ${s.pac.dir}.`,
      'Ghosts:', ...ghostLines,
      `Fright ticks left: ${s.fright}. Score ${s.score}. Lives ${s.lives}. Level ${s.level}. Pellets left ${s.left}.`,
      `Legal moves: ${legal.join(', ')}.`,
    ].join('\n');
  }

  function schemaFor(legal) {
    return {
      type: 'object',
      properties: {
        move: { type: 'string', enum: legal },
        probabilities: {
          type: 'object',
          properties: Object.fromEntries(legal.map((d) => [d, { type: 'number' }])),
          required: legal,
          additionalProperties: false,
        },
        reason: { type: 'string' },
      },
      required: ['move', 'probabilities', 'reason'],
      additionalProperties: false,
    };
  }

  let sdk = null;
  async function loadSdk() {
    if (!sdk) {
      sdk = import(SDK_URL).then((mod) => mod.default || mod.Anthropic).catch((err) => {
        sdk = null;
        throw new Error(`Could not load the Anthropic SDK (${err.message}).`);
      });
    }
    return sdk;
  }

  let cachedClient = null, cachedKey = '';
  async function client(apiKey) {
    const Anthropic = await loadSdk();
    if (!cachedClient || cachedKey !== apiKey) {
      // The key belongs to the person at the keyboard and is used only from their browser.
      cachedClient = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
      cachedKey = apiKey;
    }
    return { Anthropic, api: cachedClient };
  }

  function friendly(err, Anthropic) {
    if (!Anthropic) return err;
    if (err instanceof Anthropic.AuthenticationError) return new Error('The API key was rejected. Check it in Claude settings.');
    if (err instanceof Anthropic.PermissionDeniedError) return new Error('This API key cannot use the selected model.');
    if (err instanceof Anthropic.RateLimitError) return new Error('Rate limited by the API. Lower the speed or wait a moment.');
    if (err instanceof Anthropic.APIConnectionError) return new Error('Could not reach the Claude API from this page.');
    if (err instanceof Anthropic.APIError) return new Error(`Claude API error ${err.status ?? ''}: ${err.message}`);
    return err;
  }

  class ClaudeAgent {
    constructor() {
      this.key = 'claude';
      this.label = 'Claude';
    }

    async decide(game) {
      if (!settings.apiKey) throw new Error('Add your Anthropic API key in Claude settings to use this agent.');
      const legal = game.legal();
      const { Anthropic, api } = await client(settings.apiKey);
      const params = {
        model: settings.model,
        max_tokens: 4000,
        system: SYSTEM,
        messages: [{ role: 'user', content: boardText(game) }],
        output_config: { format: { type: 'json_schema', schema: schemaFor(legal) } },
      };
      // Haiku 4.5 does not take an effort setting.
      if (settings.model !== 'claude-haiku-4-5') params.output_config.effort = settings.effort;

      const t0 = performance.now();
      let res;
      try {
        res = settings.model === 'claude-opus-5'
          // If a safety classifier declines, the API retries on a fallback model in the same call.
          ? await api.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
          : await api.messages.create(params);
      } catch (err) {
        throw friendly(err, Anthropic);
      }
      const latencyMs = performance.now() - t0;
      if (res.stop_reason === 'refusal') throw new Error('Claude declined to answer this turn.');
      if (res.stop_reason === 'max_tokens') throw new Error('The answer was cut off before it finished.');

      const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const out = JSON.parse(text);
      return toDecision(out, legal, { latencyMs, model: res.model, usage: res.usage });
    }
  }

  // Normalize whatever the model returned into the shared decision format.
  function toDecision(out, legal, meta) {
    const raw = {};
    let total = 0;
    for (const d of legal) { raw[d] = Math.max(0, Number(out.probabilities?.[d]) || 0); total += raw[d]; }
    const probs = {};
    for (const d of legal) probs[d] = total > 0 ? raw[d] / total : 1 / legal.length;
    const best = C.decide.argmax(probs);
    return {
      agent: 'claude', label: `Claude (${meta.model})`, by: 'agent',
      choice: legal.includes(out.move) ? out.move : best,
      best, probs, scores: {}, confidence: C.decide.confidenceOf(probs),
      reason: typeof out.reason === 'string' ? out.reason : '',
      ...meta,
    };
  }

  C.claude = { settings, MODELS, boardText, schemaFor, toDecision };
  C.agents.register('claude', { label: 'Claude (API)', async: true, create: () => new ClaudeAgent() });
})(globalThis);
