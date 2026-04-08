const LEGACY_PROMPT_TEMPLATE = `你是一个严谨但鼓励式的德语老师。请评判学习者的德语翻译是否准确表达原意，并指出明显的拼写、语法、搭配、词序或自然度问题。

请基于以下内容完成判断：
- 中文原句：{{chinese}}
- 英文辅助原句：{{english}}
- 学习者德语答案：{{userGerman}}
- 参考德语答案：{{referenceGerman}}

评判原则：
1. 不要求和参考答案逐字一致。
2. 优先判断是否表达了核心意思。
3. 把“能接受但不自然”和“明显错误”区分开。
4. 如果有错误，指出具体片段、建议改法和原因。
5. better_versions 给出 1-3 个更自然的德语表达。

只返回严格 JSON，不要带 Markdown 代码块，不要额外解释：
{
  "meaning_ok": true,
  "grammar_score": 0,
  "naturalness_score": 0,
  "verdict": "",
  "summary": "",
  "errors": [
    {
      "type": "",
      "text": "",
      "suggestion": "",
      "reason": ""
    }
  ],
  "better_versions": [""]
}`;

const DETAILED_PROMPT_TEMPLATE = `你是一个严格但校准稳定的德语翻译评审器。你的任务是评判学习者的德语答案是否表达了题目原意，并区分：
1. 核心意思是否正确
2. 是否只有轻微形式问题
3. 是否存在真正影响德语质量的语法/表达问题

请基于以下内容完成判断：
- 中文原句：{{chinese}}
- 英文辅助原句：{{english}}
- 学习者德语答案：{{userGerman}}
- 参考德语答案：{{referenceGerman}}

硬性规则：
1. 不要求和参考答案逐字一致。
2. 优先判断是否表达了核心意思；如果核心意思保留，meaning_ok 应为 true。
3. 不要因为缺少句末标点、大小写小问题、空格问题、未保留说话者标签（如 LISA: / NINA:）就重罚。
4. 说话者标签只有在“谁说的话”本身影响句意时，才算重要错误；否则最多算轻微形式问题。
5. 如果答案只是少了问号、句号、冒号或引号，但句子本身德语结构正确，这只能算轻微问题。
6. 像 doch、denn 这样的语气词如果没有被直译出来，但核心句意没变，只能算轻微问题，不能重罚。
7. Ja、Nein 这类简短判断词如果学习者省略了，而主要命题内容还在，通常不算错误。
8. 错误说明只写真正值得学习者改进的点，不要为了凑条目硬写。

评分标尺（必须按这个尺度打分）：
- 9-10：德语非常自然准确；即使只有极轻微问题，例如漏标点、漏说话者标签、小的格式问题、语气词缺失、Ja/Nein 省略，也仍应在这个区间。
- 7-8：核心意思正确，也基本自然，但存在比上面更明显的轻度问题，例如轻微措辞不佳、轻微搭配问题、轻微不地道，但还不影响理解。
- 5-6：基本能懂，但有明显语法、用词或词序问题，不过不至于误解。
- 3-4：错误较多，理解吃力，或表达明显不地道。
- 0-2：核心意思错误，或德语结构严重错误导致基本无法接受。

额外校准：
- 如果 meaning_ok = true，且唯一问题只是标点或说话者标签，grammar_score 不应低于 9，naturalness_score 不应低于 9。
- 如果 meaning_ok = true，且唯一问题只是语气词（如 doch、denn）缺失或 Ja/Nein 省略，grammar_score 不应低于 9，naturalness_score 不应低于 9。
- 如果学习者答案和参考答案相比，只缺句末问号/句号，而其他内容正确，通常应判为“基本正确，有轻微问题”。
- 如果句子本身是疑问句，但只漏了问号，这不是严重语法错误。

只返回严格 JSON，不要带 Markdown 代码块，不要额外解释：
{
  "meaning_ok": true,
  "grammar_score": 0,
  "naturalness_score": 0,
  "verdict": "",
  "summary": "",
  "errors": [
    {
      "type": "",
      "text": "",
      "suggestion": "",
      "reason": ""
    }
  ]
}`;

const DEFAULT_PROMPT_TEMPLATE = `你是一个简洁、稳定的德语翻译评审器。请只判断学习者答案是否基本正确，并在确有必要时指出最重要的问题。

请基于以下内容完成判断：
- 中文原句：{{chinese}}
- 英文辅助原句：{{english}}
- 学习者德语答案：{{userGerman}}
- 参考德语答案：{{referenceGerman}}

评判要求：
1. 不要求和参考答案逐字一致。
2. 优先判断是否表达了核心意思。
3. 不要因为缺少句末标点、说话者标签、语气词（如 doch、denn）或 Ja/Nein 省略而重判错误。
4. 如果答案整体可接受，尽量少写问题说明。
5. errors 最多返回 2 条；如果没有明显问题，返回空数组。

summary 要求：
- 用 1-2 句话
- 简短直接
- 如果只是轻微问题，要明确说“整体正确”或“基本正确”

只返回严格 JSON，不要带 Markdown 代码块，不要额外解释：
{
  "summary": "",
  "errors": [
    {
      "text": "",
      "suggestion": "",
      "reason": ""
    }
  ]
}`;

const DEBUG_LOGGING_KEY = "debugLoggingEnabled";

let debugLoggingEnabled = false;

configureDebugLogging();

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});

function configureDebugLogging() {
  void loadDebugLoggingPreference();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !(DEBUG_LOGGING_KEY in changes)) {
      return;
    }

    debugLoggingEnabled = Boolean(changes[DEBUG_LOGGING_KEY].newValue);
  });
}

async function loadDebugLoggingPreference() {
  try {
    const values = await chrome.storage.sync.get(DEBUG_LOGGING_KEY);
    debugLoggingEnabled = Boolean(values[DEBUG_LOGGING_KEY]);
  } catch (_error) {
    debugLoggingEnabled = false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const traceId = getTraceId(message);
  const routeStart = performance.now();
  logBackgroundTiming(traceId, "A. 开始处理消息", undefined, {
    type: message?.type || "UNKNOWN"
  });

  void routeMessage(message, traceId)
    .then((data) => sendResponse({ success: true, data }))
    .catch((error) => {
      logBackgroundTiming(traceId, "Z. 消息处理失败", routeStart, {
        error: error instanceof Error ? error.message : String(error)
      });
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    })
    .finally(() => {
      logBackgroundTiming(traceId, "Y. 消息处理完成", routeStart);
    });

  return true;
});

async function routeMessage(message, traceId) {
  switch (message?.type) {
    case "AI_JUDGE_TRANSLATION":
      return handleJudge(message.payload, traceId);
    case "GET_CONFIG_STATUS":
      return getConfigStatus();
    case "OPEN_OPTIONS_PAGE":
      await chrome.runtime.openOptionsPage();
      return { opened: true };
    default:
      throw new Error("未知消息类型。");
  }
}

async function handleJudge(payload, traceId) {
  const totalStart = performance.now();
  validatePayload(payload);

  const configStart = performance.now();
  const config = await loadConfig();
  logBackgroundTiming(traceId, "B. 配置读取完成", configStart, {
    apiBaseUrl: config.apiBaseUrl,
    model: config.model
  });

  const permissionStart = performance.now();
  const originPattern = getOriginPattern(config.apiBaseUrl);
  const hasPermission = await chrome.permissions.contains({
    origins: [originPattern]
  });
  logBackgroundTiming(traceId, "C. 权限检查完成", permissionStart, {
    originPattern,
    hasPermission
  });

  if (!hasPermission) {
    throw new Error(`当前 API 域名未授权：${originPattern}。请在设置页重新保存配置并授权。`);
  }

  const promptStart = performance.now();
  const endpoint = buildChatCompletionsUrl(config.apiBaseUrl);
  const prompt = buildPrompt(config.promptTemplate, payload);
  const requestBody = buildRequestBody(config, prompt);
  logBackgroundTiming(traceId, "D. prompt与请求体构建完成", promptStart, {
    endpoint,
    promptLength: prompt.length,
    messageCount: Array.isArray(requestBody.messages) ? requestBody.messages.length : 0
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  let response;
  try {
    const fetchStart = performance.now();
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    logBackgroundTiming(traceId, "E. fetch返回", fetchStart, {
      status: response.status,
      ok: response.ok
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("模型响应超时，请稍后重试。");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await safeReadText(response);
    throw new Error(`API 请求失败（${response.status}）：${errorText || "无返回内容"}`);
  }

  const responseJsonStart = performance.now();
  const data = await response.json();
  logBackgroundTiming(traceId, "F. response.json完成", responseJsonStart, {
    choiceCount: Array.isArray(data?.choices) ? data.choices.length : 0
  });

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("模型没有返回可解析的内容。");
  }

  const parseStart = performance.now();
  const parsed = parseModelJson(content);
  logBackgroundTiming(traceId, "G. 模型JSON解析完成", parseStart, {
    contentLength: content.length
  });

  const normalizeStart = performance.now();
  const normalized = normalizeJudgeResult(parsed);
  logBackgroundTiming(traceId, "H. 结果标准化完成", normalizeStart, {
    errorCount: Array.isArray(normalized.errors) ? normalized.errors.length : 0
  });
  logBackgroundTiming(traceId, "I. handleJudge总耗时", totalStart);

  return normalized;
}

function buildRequestBody(config, prompt) {
  const dashScopeQwen35 = shouldDisableThinking(config);
  const messages = dashScopeQwen35
    ? [
        {
          role: "user",
          content: `你是一个德语翻译练习评审器。必须只输出 JSON。\n\n${prompt}`
        }
      ]
    : [
        {
          role: "system",
          content: "你是一个德语翻译练习评审器。必须只输出 JSON。"
        },
        {
          role: "user",
          content: prompt
        }
      ];

  const requestBody = {
    model: config.model,
    temperature: 0.2,
    max_tokens: dashScopeQwen35 ? 400 : 700,
    messages,
    response_format: {
      type: "json_object"
    }
  };

  // DashScope 的 qwen3.5 系列默认开启 thinking，非 thinking 模式下才支持稳定 JSON 输出。
  if (shouldDisableThinking(config)) {
    requestBody.extra_body = {
      enable_thinking: false
    };
  }

  return requestBody;
}

async function getConfigStatus() {
  const values = await chrome.storage.sync.get([
    "apiBaseUrl",
    "apiKey",
    "model"
  ]);

  return {
    configured: Boolean(values.apiBaseUrl && values.apiKey && values.model),
    apiBaseUrl: values.apiBaseUrl || "",
    model: values.model || ""
  };
}

async function loadConfig() {
  const values = await chrome.storage.sync.get([
    "apiBaseUrl",
    "apiKey",
    "model",
    "promptTemplate"
  ]);

  const apiBaseUrl = sanitizeBaseUrl(values.apiBaseUrl || "");
  const apiKey = (values.apiKey || "").trim();
  const model = (values.model || "").trim();
  const savedPromptTemplate = (values.promptTemplate || "").trim();
  const promptTemplate =
    !savedPromptTemplate ||
    savedPromptTemplate === LEGACY_PROMPT_TEMPLATE ||
    savedPromptTemplate === DETAILED_PROMPT_TEMPLATE
      ? DEFAULT_PROMPT_TEMPLATE
      : savedPromptTemplate;

  if (!apiBaseUrl || !apiKey || !model) {
    throw new Error("请先在设置页填写 API Base URL、API Key 和模型名。");
  }

  return {
    apiBaseUrl,
    apiKey,
    model,
    promptTemplate
  };
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("缺少题目数据。");
  }

  if (!String(payload.userGerman || "").trim()) {
    throw new Error("未读取到用户答案。");
  }

  if (!String(payload.chinese || "").trim() && !String(payload.english || "").trim()) {
    throw new Error("未读取到题目原句。");
  }
}

function buildPrompt(template, payload) {
  const replacements = {
    "{{chinese}}": payload.chinese || "（未读取到）",
    "{{english}}": payload.english || "（未读取到）",
    "{{userGerman}}": payload.userGerman || "（未读取到）",
    "{{referenceGerman}}": payload.referenceGerman || "（页面暂未显示）"
  };

  return Object.entries(replacements).reduce(
    (result, [token, value]) => result.replaceAll(token, value),
    template
  );
}

function shouldDisableThinking(config) {
  const model = String(config.model || "").trim().toLowerCase();
  const apiBaseUrl = String(config.apiBaseUrl || "").toLowerCase();

  return apiBaseUrl.includes("dashscope.aliyuncs.com/compatible-mode") && model.startsWith("qwen3.5-");
}

function sanitizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getOriginPattern(baseUrl) {
  const url = new URL(sanitizeBaseUrl(baseUrl));
  return `${url.origin}/*`;
}

function buildChatCompletionsUrl(baseUrl) {
  const url = new URL(sanitizeBaseUrl(baseUrl));
  const path = url.pathname.replace(/\/+$/, "");

  if (path.endsWith("/chat/completions")) {
    return url.toString();
  }

  if (!path || path === "/") {
    url.pathname = "/v1/chat/completions";
    return url.toString();
  }

  url.pathname = `${path}/chat/completions`;
  return url.toString();
}

function parseModelJson(text) {
  const trimmed = text.trim();
  const direct = stripCodeFence(trimmed);

  try {
    return JSON.parse(direct);
  } catch (_error) {
    const candidate = extractFirstJsonObject(direct);
    if (!candidate) {
      throw new Error("模型没有返回合法 JSON。");
    }
    return JSON.parse(candidate);
  }
}

function stripCodeFence(text) {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractFirstJsonObject(text) {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (start === -1) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        return text.slice(start, index + 1);
      }
    }
  }

  return "";
}

function normalizeJudgeResult(result) {
  const errors = Array.isArray(result?.errors) ? result.errors : [];

  return {
    summary: String(result?.summary || ""),
    errors: errors.map((item) => ({
      text: String(item?.text || ""),
      suggestion: String(item?.suggestion || ""),
      reason: String(item?.reason || "")
    })).slice(0, 2)
  };
}

async function safeReadText(response) {
  try {
    return (await response.text()).trim();
  } catch (_error) {
    return "";
  }
}

function getTraceId(message) {
  return message?.traceId || `judge-${Date.now().toString(36)}-bg`;
}

function logBackgroundTiming(traceId, label, startTime, details) {
  if (!debugLoggingEnabled) {
    return;
  }

  const duration = typeof startTime === "number" ? `${(performance.now() - startTime).toFixed(1)}ms` : "";
  const prefix = `[AI Judge][background][${traceId}] ${label}`;

  if (details) {
    console.log(prefix, duration, details);
    return;
  }

  if (duration) {
    console.log(prefix, duration);
    return;
  }

  console.log(prefix);
}
