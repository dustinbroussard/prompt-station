const dom = {
  apiKeyInput: document.getElementById('api-key-input'),
  modelSelect: document.getElementById('model-select'),
  templateSelect: document.getElementById('template-select'),
  sessionTitle: document.getElementById('session-title'),
  applyTemplateBtn: document.getElementById('apply-template-btn'),
  exportBtn: document.getElementById('export-session-btn'),
  clearBtn: document.getElementById('clear-session-btn'),
  addStageBtn: document.getElementById('add-stage-btn'),
  stagesWrapper: document.getElementById('stages-wrapper'),
  toast: document.getElementById('toast'),
  offlineIndicator: document.getElementById('offline-indicator'),
  networkPill: document.getElementById('network-pill'),
  themeToggle: document.getElementById('theme-toggle'),
  installBanner: document.getElementById('install-banner'),
  installAccept: document.getElementById('install-accept'),
  installDecline: document.getElementById('install-decline'),
};

const STORAGE_KEY = 'cm-chain-state-v1';
const API_KEY_STORAGE = 'openrouter-api-key';
const templates = {
  blank: [''],
  spec: [
    'Draft a concise PRD (user problem, goals, constraints) for the requested feature.',
    'Create a structured outline (sections, bullet points) the PRD should follow.',
    'Generate a prioritized task list with owners and acceptance criteria.',
  ],
  debug: [
    'Summarize the bug report with reproduction steps and expected vs actual behavior.',
    'Infer the likeliest root cause and suspect files given the stack trace.',
    'Produce a step-by-step fix plan plus regression checks.',
  ],
  content: [
    'Brainstorm 5 differentiated angles for this idea with target audience included.',
    'Develop a strong headline and subhead for the best angle.',
    'Write 3 social captions with hashtags and a 1-sentence CTA.',
  ],
};

const validateApiKey = (key) => typeof key === 'string' && key.startsWith('sk-or-v1-') && key.length > 20;

const createId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `stage-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createStage = (prompt = '') => ({
  id: createId(),
  prompt,
  response: '',
  status: 'idle',
  error: '',
  history: [],
  model: '',
});

const defaultState = () => ({
  apiKey: '',
  model: 'deepseek/deepseek-r1-0528',
  stages: [createStage()],
  isProcessing: false,
  templateId: 'blank',
  theme: 'dark',
  connectivity: navigator.onLine ? 'online' : 'offline',
  sessionTitle: '',
});

const sanitizeState = (state) => {
  const base = state || defaultState();
  const safeStages = Array.isArray(base.stages) && base.stages.length > 0 ? base.stages : [createStage()];
  return {
    ...defaultState(),
    ...base,
    isProcessing: Boolean(base.isProcessing),
    stages: safeStages.map((stage) => ({
      ...createStage(),
      ...stage,
      status: stage.status || 'idle',
      error: stage.error || '',
      prompt: stage.prompt || '',
      response: stage.response || '',
      history: Array.isArray(stage.history) ? stage.history : [],
      model: typeof stage.model === 'string' ? stage.model : '',
    })),
  };
};

const persistState = (state) => {
  try {
    const payload = {
      apiKey: validateApiKey(state.apiKey) ? state.apiKey : '',
      model: state.model,
      templateId: state.templateId,
      theme: state.theme,
      sessionTitle: state.sessionTitle,
      stages: state.stages.map(({ id, prompt, response, history, model }) => ({ id, prompt, response, history, model })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    if (validateApiKey(state.apiKey)) {
      localStorage.setItem(API_KEY_STORAGE, state.apiKey);
    }
  } catch (error) {
    console.error('Persist failed', error);
  }
};

const loadState = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : defaultState();
  const safeParsed = {
    ...parsed,
    stages: (parsed.stages || []).map((stage) => ({
      ...stage,
      status: stage.status === 'running' ? 'idle' : stage.status,
      model: typeof stage.model === 'string' ? stage.model : '',
    })),
  };
    const merged = sanitizeState(safeParsed);
    const storedKey = localStorage.getItem(API_KEY_STORAGE);
    if (storedKey && validateApiKey(storedKey)) merged.apiKey = storedKey;
    return merged;
  } catch (error) {
    console.warn('Falling back to defaults', error);
    return defaultState();
  }
};

const createStore = (initial) => {
  let state = sanitizeState(initial);
  const listeners = new Set();

  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const notify = () => listeners.forEach((listener) => listener(state));

  const setState = (updater) => {
    const clone = () => {
      try {
        return structuredClone(state);
      } catch (error) {
        return JSON.parse(JSON.stringify(state));
      }
    };
    const next = typeof updater === 'function' ? updater(clone()) : updater;
    state = sanitizeState(next);
    persistState(state);
    notify();
  };

  const updateStage = (stageId, patch) => {
    setState((current) => ({
      ...current,
      stages: current.stages.map((stage) => (stage.id === stageId ? { ...stage, ...patch } : stage)),
    }));
  };

  const replaceStages = (stages) => {
    setState((current) => ({ ...current, stages: stages.length ? stages : [createStage()] }));
  };

  return {
    subscribe,
    setState,
    getState: () => state,
    updateStage,
    replaceStages,
  };
};

const store = createStore(loadState());
const controllers = new Map();
const streamingBuffer = new Map();
let deferredInstallPrompt = null;

const setConnectivity = (status) => {
  document.body.dataset.connectivity = status;
  if (dom.networkPill) {
    dom.networkPill.textContent = status === 'online' ? 'Online' : 'Offline';
    dom.networkPill.className = `pill pill--status ${status === 'online' ? 'pill--success' : 'pill--danger'}`;
  }
  if (dom.offlineIndicator) {
    dom.offlineIndicator.dataset.visible = status === 'offline';
  }
};

const showToast = (message) => {
  if (!dom.toast) return;
  dom.toast.textContent = message;
  dom.toast.dataset.visible = 'true';
  setTimeout(() => {
    dom.toast.dataset.visible = 'false';
  }, 2600);
};

const applyTheme = (theme) => {
  document.documentElement.dataset.theme = theme;
  if (dom.themeToggle) dom.themeToggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
};

const renderConfig = (state) => {
  if (dom.apiKeyInput && dom.apiKeyInput.value !== state.apiKey) {
    dom.apiKeyInput.value = state.apiKey;
  }
  if (dom.modelSelect) dom.modelSelect.value = state.model;
  if (dom.templateSelect) dom.templateSelect.value = state.templateId;
  if (dom.sessionTitle && dom.sessionTitle.value !== state.sessionTitle) dom.sessionTitle.value = state.sessionTitle;

  const status = document.getElementById('api-key-status');
  if (status) {
    if (!state.apiKey) {
      status.textContent = '';
    } else if (!validateApiKey(state.apiKey)) {
      status.textContent = 'API key format looks invalid.';
    } else {
      status.textContent = 'API key stored locally and will be reused offline.';
    }
  }
};

const buildStageCard = (stage, index, previousOutput) => {
  const card = document.createElement('article');
  card.className = 'stage-card';
  card.dataset.stageId = stage.id;
  card.setAttribute('role', 'listitem');
  card.innerHTML = `
    <div class="stage-card__header">
      <div>
        <p class="eyebrow small">Stage ${index + 1}</p>
        <h3 class="stage-card__title">Chain Step ${index + 1}</h3>
        <p class="muted">Connects to the previous response automatically.</p>
      </div>
      <div class="stage-card__status">
        <span class="pill pill--muted" data-role="status-label">Idle</span>
        <button data-action="toggle-prev" class="ghost-btn small" type="button">Prev Output</button>
      </div>
    </div>
    <label class="field" for="model-${stage.id}">
      <span class="field__label">Stage Model (optional)</span>
      <select id="model-${stage.id}" data-field="stage-model">
        <option value="">Use session default</option>
        <option value="deepseek/deepseek-r1-0528">DeepSeek R1 0528 (Free)</option>
        <option value="meta-llama/llama-3.1-8b-instruct">Llama 3.1 8B Instruct (Free/Low)</option>
        <option value="mistralai/mistral-nemo">Mistral Nemo (Low Cost)</option>
        <option value="google/gemma-7b-it">Gemma 7B IT (Low Cost)</option>
      </select>
    </label>
    <label class="field" for="prompt-${stage.id}">
      <span class="field__label">Prompt</span>
      <textarea id="prompt-${stage.id}" data-field="prompt" placeholder="Enter prompt for stage ${index + 1}"></textarea>
    </label>
    <div class="action-bar">
      <button data-action="send" class="primary-btn" type="button">Send to LLM</button>
      <button data-action="stop" class="ghost-btn danger" type="button">Stop</button>
      <button data-action="copy" class="ghost-btn" type="button">Copy</button>
    </div>
    <div class="previous-output muted" data-role="previous" data-open="false">No previous output captured yet.</div>
    <div class="response" data-role="response" aria-live="polite">${stage.response || 'Awaiting response...'}</div>
    <div class="field__hint" data-role="error"></div>
  `;
  return card;
};

const updateStageCard = (card, stage, index, previousOutput, state, liveResponse) => {
  const textarea = card.querySelector('textarea');
  if (textarea && textarea.value !== stage.prompt) textarea.value = stage.prompt;

  const modelSelect = card.querySelector('select[data-field="stage-model"]');
  if (modelSelect) {
    modelSelect.value = stage.model || '';
    const defaultOption = modelSelect.querySelector('option[value=""]');
    if (defaultOption) defaultOption.textContent = `Use session default (${state.model})`;
  }

  const responseBox = card.querySelector('[data-role="response"]');
  const responseText = liveResponse ?? stage.response;
  if (responseBox && responseText) responseBox.textContent = responseText;
  if (responseBox && !responseText) responseBox.textContent = 'Awaiting response...';

  const prevBlock = card.querySelector('[data-role="previous"]');
  if (prevBlock) prevBlock.textContent = previousOutput || 'No previous output captured yet.';

  const statusLabel = card.querySelector('[data-role="status-label"]');
  if (statusLabel) {
    statusLabel.textContent = stage.status === 'running' ? 'Processing' : stage.status === 'error' ? 'Issue' : 'Idle';
    statusLabel.className = 'pill pill--muted';
    if (stage.status === 'running') statusLabel.classList.add('pill--warning');
    if (stage.status === 'error') statusLabel.classList.add('pill--danger');
    if (stage.status === 'complete') statusLabel.classList.add('pill--success');
  }

  const sendBtn = card.querySelector('[data-action="send"]');
  if (sendBtn) sendBtn.disabled = state.isProcessing || !stage.prompt.trim() || state.connectivity === 'offline';

  const stopBtn = card.querySelector('[data-action="stop"]');
  if (stopBtn) stopBtn.style.display = stage.status === 'running' ? 'inline-flex' : 'none';

  const copyBtn = card.querySelector('[data-action="copy"]');
  if (copyBtn) copyBtn.disabled = !stage.response;

  const error = card.querySelector('[data-role="error"]');
  if (error) {
    error.textContent = stage.error || '';
    error.style.color = stage.error ? 'var(--danger)' : 'var(--muted)';
  }

  card.dataset.index = String(index);
};

const renderStages = (state) => {
  const { stagesWrapper } = dom;
  if (!stagesWrapper) return;
  const seen = new Set();

  state.stages.forEach((stage, index) => {
    const previousOutput = index > 0 ? state.stages[index - 1].response : '';
    const liveResponse = streamingBuffer.get(stage.id);
    let card = stagesWrapper.querySelector(`[data-stage-id="${stage.id}"]`);
    if (!card) {
      card = buildStageCard(stage, index, previousOutput);
      stagesWrapper.appendChild(card);
    }
    updateStageCard(card, stage, index, previousOutput, state, liveResponse);
    seen.add(stage.id);
  });

  Array.from(stagesWrapper.children).forEach((child) => {
    if (!seen.has(child.dataset.stageId)) child.remove();
  });
};

const render = (state) => {
  renderConfig(state);
  renderStages(state);
  applyTheme(state.theme);
  setConnectivity(state.connectivity);
  document.title = state.sessionTitle ? `${state.sessionTitle} | Chain Processor` : 'Code Maniac LLM Chain Processor';
};

const streamChat = async ({ apiKey, model, messages, onChunk, signal }) => {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.href.split('?')[0],
      'X-Title': 'Code Maniac LLM Chain Processor',
    },
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 4096, stream: true }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `HTTP error: ${response.status}`;
    throw new Error(message);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!response.body || !contentType.includes('text/event-stream')) {
    const data = await response.json();
    const llmResponse = data.choices?.[0]?.message?.content?.trim?.() || '';
    onChunk(llmResponse);
    return llmResponse;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let acc = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      const lines = part.split('\n').map((line) => line.trim()).filter(Boolean);
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const dataStr = line.slice(5).trim();
        if (dataStr === '[DONE]') return acc.trim();
        try {
          const json = JSON.parse(dataStr);
          const choice = json.choices?.[0];
          const delta = choice?.delta?.content ?? choice?.message?.content ?? choice?.text ?? '';
          if (delta) {
            acc += delta;
            onChunk(acc);
          }
        } catch (error) {
          // ignore malformed chunk
        }
      }
    }
  }

  return acc.trim();
};

const processStage = async (stageId) => {
  const state = store.getState();
  const stageIndex = state.stages.findIndex((s) => s.id === stageId);
  const stage = state.stages[stageIndex];
  if (!stage) return;

  if (!stage.prompt.trim()) {
    showToast('Prompt cannot be empty.');
    return;
  }

  if (!validateApiKey(state.apiKey)) {
    showToast('Enter a valid OpenRouter API key.');
    dom.apiKeyInput?.focus();
    return;
  }

  if (state.connectivity === 'offline') {
    showToast('You appear to be offline. Try again when connected.');
    return;
  }

  const modelToUse = stage.model || state.model;
  const messages = [
    {
      role: 'system',
      content:
        stageIndex > 0 && state.stages[stageIndex - 1]?.response
          ? `You are a precise assistant. Use the previous stage output as context.\n${state.stages[stageIndex - 1].response}`
          : 'You are a precise assistant.',
    },
    { role: 'user', content: stage.prompt },
  ];

  const controller = new AbortController();
  controllers.set(stageId, controller);

    store.setState((current) => ({
      ...current,
      isProcessing: true,
    stages: current.stages.map((s) => (s.id === stageId ? { ...s, status: 'running', error: '', response: '' } : s)),
  }));

  const responseBox = document.querySelector(`[data-stage-id="${stageId}"] [data-role="response"]`);
  if (responseBox) responseBox.textContent = 'Connecting to OpenRouter...';

  try {
    let streamedText = '';
    const finalText = await streamChat({
      apiKey: state.apiKey,
      model: modelToUse,
      messages,
      signal: controller.signal,
      onChunk: (chunk) => {
        streamedText = chunk;
        streamingBuffer.set(stageId, chunk);
        if (responseBox) responseBox.textContent = chunk;
      },
    });

    const resolved = finalText || streamedText;
    store.updateStage(stageId, {
      response: resolved,
      status: 'complete',
      history: messages,
    });
    showToast('Stage completed.');
  } catch (error) {
    if (error?.name === 'AbortError') {
      store.updateStage(stageId, { status: 'idle', error: 'Request cancelled.' });
      showToast('Request cancelled.');
    } else {
      store.updateStage(stageId, { status: 'error', error: error?.message || 'Unknown error' });
      showToast('Something went wrong.');
    }
  } finally {
    controllers.delete(stageId);
    streamingBuffer.delete(stageId);
    store.setState((current) => ({ ...current, isProcessing: false }));
  }
};

const stopStage = (stageId) => {
  const controller = controllers.get(stageId);
  if (controller) controller.abort();
};

const copyResponse = async (stageId) => {
  const stage = store.getState().stages.find((s) => s.id === stageId);
  if (!stage?.response) return;
  try {
    await navigator.clipboard.writeText(stage.response);
    showToast('Response copied.');
  } catch (error) {
    console.error('Copy failed', error);
    showToast('Copy blocked by browser.');
  }
};

const togglePreviousOutput = (card) => {
  const block = card.querySelector('[data-role="previous"]');
  if (!block) return;
  const isOpen = block.dataset.open === 'true';
  block.dataset.open = isOpen ? 'false' : 'true';
};

const applyTemplate = () => {
  const templateId = dom.templateSelect?.value || 'blank';
  const templateStages = templates[templateId] || templates.blank;
  const hasContent = store.getState().stages.some((stage) => stage.prompt || stage.response);
  if (hasContent && !confirm('Applying a template will replace current prompts. Continue?')) return;

  const stages = templateStages.map((prompt) => createStage(prompt));
  store.setState((current) => ({ ...current, templateId, stages }));
  showToast('Template applied.');
};

const exportSession = () => {
  const state = store.getState();
  const payload = {
    exportedAt: new Date().toISOString(),
    model: state.model,
    theme: state.theme,
    sessionTitle: state.sessionTitle,
    stages: state.stages.map(({ prompt, response, history }) => ({ prompt, response, history })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `llm-chain-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('Session exported.');
};

const resetSession = () => {
  if (!confirm('Reset the chain? This clears prompts and responses.')) return;
  store.setState(defaultState());
  showToast('Session reset.');
};

const registerEvents = () => {
  dom.apiKeyInput?.addEventListener('input', (event) => {
    store.setState((current) => ({ ...current, apiKey: event.target.value.trim() }));
  });

  dom.modelSelect?.addEventListener('change', (event) => {
    store.setState((current) => ({ ...current, model: event.target.value }));
  });

  dom.templateSelect?.addEventListener('change', (event) => {
    store.setState((current) => ({ ...current, templateId: event.target.value }));
  });

  dom.sessionTitle?.addEventListener('input', (event) => {
    store.setState((current) => ({ ...current, sessionTitle: event.target.value }));
  });

  dom.applyTemplateBtn?.addEventListener('click', applyTemplate);
  dom.exportBtn?.addEventListener('click', exportSession);
  dom.clearBtn?.addEventListener('click', resetSession);

  dom.addStageBtn?.addEventListener('click', () => {
    store.setState((current) => ({ ...current, stages: [...current.stages, createStage()] }));
  });

  dom.stagesWrapper?.addEventListener('input', (event) => {
    const textarea = event.target.closest('textarea[data-field="prompt"]');
    if (!textarea) return;
    const card = textarea.closest('[data-stage-id]');
    if (!card) return;
    store.updateStage(card.dataset.stageId, { prompt: textarea.value });
  });

  dom.stagesWrapper?.addEventListener('change', (event) => {
    const select = event.target.closest('select[data-field="stage-model"]');
    if (!select) return;
    const card = select.closest('[data-stage-id]');
    if (!card) return;
    store.updateStage(card.dataset.stageId, { model: select.value });
  });

  dom.stagesWrapper?.addEventListener('click', (event) => {
    const actionBtn = event.target.closest('[data-action]');
    if (!actionBtn) return;
    const card = actionBtn.closest('[data-stage-id]');
    if (!card) return;
    const stageId = card.dataset.stageId;
    const action = actionBtn.dataset.action;

    if (action === 'send') processStage(stageId);
    if (action === 'stop') stopStage(stageId);
    if (action === 'copy') copyResponse(stageId);
    if (action === 'toggle-prev') togglePreviousOutput(card);
  });

  dom.themeToggle?.addEventListener('click', () => {
    const nextTheme = store.getState().theme === 'dark' ? 'light' : 'dark';
    store.setState((current) => ({ ...current, theme: nextTheme }));
  });

  window.addEventListener('online', () => {
    store.setState((current) => ({ ...current, connectivity: 'online' }));
    showToast('Back online.');
  });

  window.addEventListener('offline', () => {
    store.setState((current) => ({ ...current, connectivity: 'offline' }));
    showToast('You are offline. Drafts are saved locally.');
  });
};

const setupInstallPrompt = () => {
  if (!dom.installBanner) return;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    dom.installBanner.style.display = 'block';
  });

  dom.installAccept?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') showToast('App installed.');
    deferredInstallPrompt = null;
    dom.installBanner.style.display = 'none';
  });

    dom.installDecline?.addEventListener('click', () => {
      deferredInstallPrompt = null;
      dom.installBanner.style.display = 'none';
    });
};

const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => console.error('SW registration failed', error));
  });
};

store.subscribe(render);

const init = () => {
  registerEvents();
  setupInstallPrompt();
  registerServiceWorker();
  render(store.getState());
};

init();
