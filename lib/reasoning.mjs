const SUPPORTED = new Set(['off', 'on', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = () => Object.assign(new Error('Ce réglage de réflexion n’est pas disponible pour le modèle choisi. Actualise les modèles avant de réessayer.'), { status: 400, code: 'reasoning-unavailable' });

// A bounded lexer, never a Jinja interpreter. Strings/comments/raw text cannot
// advertise a control. Only a simple external variable branch qualifies below.
function templateBlocks(template) {
  if (typeof template !== 'string' || !template.length || template.length > 262144 || template.includes('\0')) return null;
  const blocks = [];
  let at = 0;
  while (at < template.length) {
    const start = template.slice(at).search(/\{[{%#]/);
    if (start < 0) break;
    at += start;
    const kind = template[at + 1], end = kind === '#' ? '#}' : kind === '%' ? '%}' : '}}';
    if (kind === '#') {
      const close = template.indexOf(end, at + 2);
      if (close < 0) return null;
      at = close + 2; continue;
    }
    const tokens = [];
    let i = at + 2;
    if (template[i] === '-' || template[i] === '+') i++;
    for (; i < template.length;) {
      if (template.startsWith(end, i) || /[-+]/.test(template[i]) && template.startsWith(end, i + 1)) break;
      const char = template[i];
      if (/\s/.test(char)) { i++; continue; }
      if (char === '"' || char === "'") {
        const quote = char; i++;
        while (i < template.length && template[i] !== quote) { if (template[i] === '\\') i++; i++; }
        if (i >= template.length) return null;
        i++; tokens.push(null); continue;
      }
      const identifier = /^[a-zA-Z_]\w*/.exec(template.slice(i));
      if (identifier) { tokens.push(identifier[0]); i += identifier[0].length; continue; }
      const operator = /^(?:==|!=|<=|>=)/.exec(template.slice(i));
      if (operator) { tokens.push(operator[0]); i += operator[0].length; continue; }
      tokens.push(char); i++;
    }
    if (i >= template.length) return null;
    let parentheses = 0;
    for (const token of tokens) {
      if (token === '(') parentheses++;
      if (token === ')' && --parentheses < 0) return null;
    }
    if (parentheses) return null;
    at = i + (template.startsWith(end, i) ? 2 : 3);
    if (kind === '%' && tokens.length === 1 && tokens[0] === 'raw') {
      const rawEnd = /\{%-?\s*endraw\s*-?%\}/g; rawEnd.lastIndex = at;
      const match = rawEnd.exec(template);
      if (!match) return null;
      at = rawEnd.lastIndex; continue;
    }
    blocks.push({ kind, tokens });
  }
  return blocks;
}

/** Conservative positive evidence of native enable_thinking control, not graded effort. */
export function llamaThinkingCapability(props) {
  const blocks = templateBlocks(props?.chat_template);
  if (!blocks) return null;
  let controls = 0, defaults = 0;
  const scopes = [];
  for (const { kind, tokens } of blocks) {
    const tag = kind === '%' ? tokens[0] : null;
    const expressionText = tokens.slice(1).filter(token => token !== '(' && token !== ')').join(' ');
    const alwaysFalse = ['false', 'False', 'not true', 'not True'].includes(expressionText);
    const alwaysTrue = ['true', 'True', 'not false', 'not False'].includes(expressionText);
    if (typeof tag === 'string' && tag.startsWith('end')) {
      if (scopes.pop()?.tag !== tag.slice(3)) return null;
      continue;
    }
    if (['else', 'elif'].includes(tag)) {
      const scope = scopes.at(-1);
      if (!scope || !['if', 'for'].includes(scope.tag) || tag === 'elif' && scope.tag !== 'if') return null;
      scope.inactive = scope.alwaysTrue || tag === 'elif' && alwaysFalse;
      if (tag === 'elif' && alwaysTrue) scope.alwaysTrue = true;
    }
    const inactive = scopes.some(scope => scope.inactive), macro = scopes.some(scope => scope.tag === 'macro');
    if (['if', 'for', 'macro', 'block', 'with', 'call', 'filter', 'autoescape'].includes(tag)) {
      scopes.push({ tag, inactive: tag === 'if' && alwaysFalse, alwaysTrue: tag === 'if' && alwaysTrue });
    }
    if (!tokens.includes('enable_thinking')) continue;
    if (macro || tag === 'macro' || kind !== '%') return null;
    if (tokens[0] === 'set') {
      // A self-default retains the caller's false/true. Any constant, later,
      // indirect or conditional assignment is deliberately ambiguous.
      const text = tokens.join(' ');
      if (scopes.length || controls || defaults++ || !/^set enable_thinking = enable_thinking \| default \( (?:true|false|True|False) \)$/.test(text)) return null;
      continue;
    }
    if (!['if', 'elif'].includes(tokens[0]) || tokens.some((token, index) => token === 'enable_thinking' && (tokens[index - 1] === '.' || tokens[index + 1] === '('))) return null;
    // An is-defined check alone does not distinguish false from true.
    const expression = tokens.slice(1).filter(token => token !== '(' && token !== ')').join(' ');
    const direct = '(?:not )?enable_thinking(?: (?:is(?: not)?|==|!=) (?:true|false|True|False))?';
    if (!inactive && new RegExp('^(?:enable_thinking is defined and )?' + direct + '$').test(expression)) controls++;
  }
  return controls && !scopes.length ? { kind: 'toggle', allowedOptions: ['off', 'on'], default: null,
    transport: 'chat-template-enable-thinking', evidenceSource: 'props-template-control' } : null;
}

/** Transport allowlist. The browser cannot smuggle another request field through reasoning. */
export function llamaReasoningPayload(payload) {
  if (!record(payload)) throw invalid();
  if (!Object.keys(payload).length) return {};
  if (Object.keys(payload).length !== 1 || !Object.hasOwn(payload, 'chat_template_kwargs')) throw invalid();
  const kwargs = payload.chat_template_kwargs;
  if (!record(kwargs) || Object.keys(kwargs).length !== 1 || !Object.hasOwn(kwargs, 'enable_thinking') || typeof kwargs.enable_thinking !== 'boolean') throw invalid();
  return { chat_template_kwargs: { enable_thinking: kwargs.enable_thinking } };
}

export function normalizeReasoning(capability) {
  if (!capability || !Array.isArray(capability.allowed_options)) return null;
  const allowedOptions = [...new Set(capability.allowed_options.filter(value => SUPPORTED.has(value)))];
  if (!allowedOptions.length) return null;
  return { allowedOptions, default: allowedOptions.includes(capability.default) ? capability.default : null };
}

export function reasoningRequest(model, choice) {
  if (choice === undefined || choice === null || choice === 'default') return { choice: null, payload: {} };
  if (typeof choice !== 'string' || !Array.isArray(model?.reasoning?.allowedOptions) || !model.reasoning.allowedOptions.includes(choice)) throw invalid();
  if (model.reasoning.kind === 'toggle') {
    if (model.reasoning.transport !== 'chat-template-enable-thinking' || !['off', 'on'].includes(choice)) throw invalid();
    return { choice, payload: { chat_template_kwargs: { enable_thinking: choice === 'on' } } };
  }
  if (model.capabilityEvidence?.provider === 'llamacpp') throw invalid();
  // Bionic's installed OpenAI adapter maps none -> off and medium -> on for
  // binary models. Only a model's advertised native choices reach this mapping.
  const effort = choice === 'off' ? 'none' : choice === 'on' ? 'medium' : choice;
  return { choice, payload: { reasoning_effort: effort } };
}
