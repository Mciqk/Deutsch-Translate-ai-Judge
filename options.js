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

const elements = {
  apiBaseUrl: document.getElementById("apiBaseUrl"),
  apiKey: document.getElementById("apiKey"),
  model: document.getElementById("model"),
  promptTemplate: document.getElementById("promptTemplate"),
  saveButton: document.getElementById("saveButton"),
  resetPromptButton: document.getElementById("resetPromptButton"),
  status: document.getElementById("status")
};

void loadSettings();

elements.saveButton.addEventListener("click", async () => {
  await saveSettings();
});

elements.resetPromptButton.addEventListener("click", () => {
  elements.promptTemplate.value = DEFAULT_PROMPT_TEMPLATE;
  setStatus("已恢复默认提示词，记得点击保存。");
});

async function loadSettings() {
  const values = await chrome.storage.sync.get([
    "apiBaseUrl",
    "apiKey",
    "model",
    "promptTemplate"
  ]);

  elements.apiBaseUrl.value = values.apiBaseUrl || "";
  elements.apiKey.value = values.apiKey || "";
  elements.model.value = values.model || "";
  const savedPromptTemplate = (values.promptTemplate || "").trim();
  elements.promptTemplate.value =
    !savedPromptTemplate ||
    savedPromptTemplate === LEGACY_PROMPT_TEMPLATE ||
    savedPromptTemplate === DETAILED_PROMPT_TEMPLATE
      ? DEFAULT_PROMPT_TEMPLATE
      : savedPromptTemplate;
}

async function saveSettings() {
  const apiBaseUrl = elements.apiBaseUrl.value.trim().replace(/\/+$/, "");
  const apiKey = elements.apiKey.value.trim();
  const model = elements.model.value.trim();
  const promptTemplate = elements.promptTemplate.value.trim() || DEFAULT_PROMPT_TEMPLATE;

  if (!apiBaseUrl || !apiKey || !model) {
    setStatus("API Base URL、API Key 和模型名都必须填写。", true);
    return;
  }

  let permissionMessage = "";
  try {
    const originPattern = `${new URL(apiBaseUrl).origin}/*`;
    const granted = await chrome.permissions.request({
      origins: [originPattern]
    });

    if (!granted) {
      setStatus("没有拿到 API 域名权限，无法保存。", true);
      return;
    }

    permissionMessage = `已授权 ${originPattern}`;
  } catch (_error) {
    setStatus("API Base URL 格式不正确。", true);
    return;
  }

  await chrome.storage.sync.set({
    apiBaseUrl,
    apiKey,
    model,
    promptTemplate
  });

  setStatus(`配置已保存。${permissionMessage}`, false, true);
}

function setStatus(message, isError = false, isOk = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("is-error", isError);
  elements.status.classList.toggle("is-ok", isOk);
}
