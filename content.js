const SELECTORS = {
  chinese: "span.translation-chinese-span",
  english: "span.translation-span",
  answer: "textarea.translation_sentence_textarea",
  reference: ".sentence-div.sentence"
};

const BUTTON_CLASS = "sl-ai-judge-btn";
const CARD_CLASS = "sl-ai-judge-card";
const DEBUG_LOGGING_KEY = "debugLoggingEnabled";

let debugLoggingEnabled = false;

configureDebugLogging();
init();

function init() {
  mountJudgeButton();

  const observer = new MutationObserver(() => {
    mountJudgeButton();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

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

function mountJudgeButton() {
  const compareButtons = findCompareButtons();
  if (compareButtons.length === 0) {
    return;
  }

  for (const compareButton of compareButtons) {
    const actionRow = compareButton.parentElement || compareButton;
    const existingJudgeButton = actionRow.querySelector(`.${BUTTON_CLASS}`);
    if (existingJudgeButton) {
      syncButtonDimensions(compareButton, existingJudgeButton);

      // 原生脚本依赖 compare/show-original/reference 这几个兄弟节点顺序，
      // 所以把扩展按钮固定放到整行末尾，并且只在位置不对时做一次移动。
      if (existingJudgeButton !== actionRow.lastElementChild) {
        actionRow.appendChild(existingJudgeButton);
      }
      continue;
    }

    const judgeButton = document.createElement("button");
    judgeButton.type = "button";
    judgeButton.className = `${compareButton.className} ${BUTTON_CLASS}`.trim();
    judgeButton.textContent = "AI评判";
    syncButtonDimensions(compareButton, judgeButton);
    judgeButton.addEventListener("click", async () => {
      await handleJudgeClick(compareButton);
    });

    actionRow.appendChild(judgeButton);
  }
}

async function handleJudgeClick(compareButton) {
  const traceId = createJudgeTraceId();
  const clickStart = performance.now();
  const actionRow = compareButton.parentElement || compareButton;
  const resultCard = ensureResultCard(actionRow);
  logContentTiming(traceId, "1. 点击按钮");
  const payload = getCurrentExerciseData(compareButton);
  logContentTiming(traceId, "2. 数据收集完成", clickStart, {
    chineseLength: payload.chinese.length,
    englishLength: payload.english.length,
    userGermanLength: payload.userGerman.length,
    referenceGermanLength: payload.referenceGerman.length
  });

  if (!payload.chinese && !payload.english) {
    renderMessage(resultCard, "没有读到题目原句，请检查页面是否加载完整。", "error");
    return;
  }

  if (!payload.userGerman) {
    renderMessage(resultCard, "请先输入你的德语答案。", "error");
    return;
  }

  resultCard.classList.remove("is-error");
  resultCard.classList.add("is-loading");
  resultCard.innerHTML = `
    <div class="sl-ai-judge-card__title">AI 正在评判</div>
    <div class="sl-ai-judge-card__meta">已读取当前题目并发送到你配置的模型服务。</div>
  `;

  try {
    const messageStart = performance.now();
    const response = await chrome.runtime.sendMessage({
      type: "AI_JUDGE_TRANSLATION",
      payload,
      traceId
    });
    logContentTiming(traceId, "3. AI返回完成", messageStart);

    if (!response?.success) {
      throw new Error(response?.error || "未知错误");
    }

    renderJudgeResult(resultCard, payload, response.data);
    logContentTiming(traceId, "4. 结果渲染完成", clickStart);
  } catch (error) {
    logContentTiming(traceId, "3. AI返回失败", clickStart, {
      error: error instanceof Error ? error.message : String(error)
    });
    renderMessage(
      resultCard,
      `评判失败：${error instanceof Error ? error.message : String(error)}`,
      "error"
    );
  }
}

function getCurrentExerciseData(compareButton) {
  const exerciseScope = getExerciseScope(compareButton);
  const answerElement = getClosestAnswerInput(compareButton) || exerciseScope.querySelector(SELECTORS.answer);
  const sentenceId = getSentenceId(compareButton);
  const localPrompt = getLocalPromptPair(answerElement, compareButton);
  const chinese =
    localPrompt.chinese ||
    getPromptTextBySentenceId(sentenceId, "chinese") ||
    getScopedPromptText(compareButton, exerciseScope, SELECTORS.chinese);
  const english =
    localPrompt.english ||
    getPromptTextBySentenceId(sentenceId, "english") ||
    getScopedPromptText(compareButton, exerciseScope, SELECTORS.english);
  const displayedAnswer = getDisplayedAnswer(compareButton);
  const referenceGerman = getReferenceGerman(compareButton, exerciseScope, sentenceId);

  return {
    chinese,
    english,
    userGerman: answerElement?.value?.trim() || displayedAnswer,
    referenceGerman
  };
}

function getClosestAnswerInput(compareButton) {
  const indexedAnswerInput = getIndexedAnswerInput(compareButton);
  if (indexedAnswerInput) {
    return indexedAnswerInput;
  }

  const siblingAnswerInput = getSiblingAnswerInput(compareButton);
  if (siblingAnswerInput) {
    return siblingAnswerInput;
  }

  const exerciseScope = getExerciseScope(compareButton);
  const scopedInputs = [
    exerciseScope,
    compareButton.closest(".translation-div"),
    compareButton.closest(".exercise-div"),
    compareButton.parentElement,
    document.body
  ]
    .filter(Boolean)
    .flatMap((container) => [...container.querySelectorAll(SELECTORS.answer)]);

  return scopedInputs.find((element) => isVisible(element)) || null;
}

function getIndexedAnswerInput(compareButton) {
  const match = String(compareButton.id || "").match(/translation_submit_(\d+)/);
  if (!match) {
    return null;
  }

  return document.getElementById(`translation_textarea_${match[1]}`);
}

function getSiblingAnswerInput(compareButton) {
  const actionRow = compareButton.parentElement;
  if (!actionRow) {
    return null;
  }

  const siblingCandidates = [
    actionRow.previousElementSibling,
    actionRow.parentElement?.querySelector(SELECTORS.answer) || null,
    actionRow.closest(".translation_sentence_div")?.previousElementSibling || null
  ].filter(Boolean);

  for (const candidate of siblingCandidates) {
    const input =
      candidate.matches?.(SELECTORS.answer)
        ? candidate
        : candidate.querySelector?.(SELECTORS.answer);

    if (input) {
      return input;
    }
  }

  return null;
}

function getDisplayedAnswer(compareButton) {
  const actionRow = compareButton.parentElement;
  const answerRow = actionRow?.querySelector("div[style*='color:black']");
  const rawText = normalizeWhitespace(answerRow?.innerText || "");

  return rawText.replace(/^您的答案：\s*/, "").replace(/\.\.\.$/, "").trim();
}

function getSentenceId(compareButton) {
  const actionRow = compareButton.parentElement;
  const sentenceElement = actionRow?.querySelector(".sentence-div.sentence");
  return sentenceElement?.id || "";
}

function getLocalPromptPair(answerElement, compareButton) {
  const anchors = [answerElement, answerElement?.parentElement, compareButton.parentElement].filter(Boolean);

  for (const anchor of anchors) {
    const candidates = getPreviousPromptCandidates(anchor);
    if (candidates.length === 0) {
      continue;
    }

    const chinese = candidates.find((text) => containsChinese(text)) || "";
    const english = candidates.find((text) => looksLikeEnglishPrompt(text)) || "";

    if (chinese || english) {
      return { chinese, english };
    }
  }

  return { chinese: "", english: "" };
}

function getPreviousPromptCandidates(anchorElement) {
  const candidates = [];
  let current = anchorElement?.previousElementSibling || null;
  let inspected = 0;

  while (current && inspected < 8) {
    const text = getText(current);
    if (isPromptTextCandidate(text)) {
      candidates.push(text);
    }

    current = current.previousElementSibling;
    inspected += 1;
  }

  return candidates;
}

function isPromptTextCandidate(text) {
  if (!text) {
    return false;
  }

  if (text.length > 200) {
    return false;
  }

  if (/比较答案|AI评判|隐藏原文|AI 评判结果|你的答案|参考答案/.test(text)) {
    return false;
  }

  return containsChinese(text) || looksLikeEnglishPrompt(text);
}

function containsChinese(text) {
  return /[\u3400-\u9fff]/.test(text);
}

function looksLikeEnglishPrompt(text) {
  return /[A-Za-z]/.test(text) && !containsChinese(text);
}

function getPromptTextBySentenceId(sentenceId, suffix) {
  if (!sentenceId) {
    return "";
  }

  const element = document.getElementById(`${sentenceId}_${suffix}`);
  return getText(element);
}

function getExerciseScope(compareButton) {
  const answerInput = getIndexedAnswerInput(compareButton) || getSiblingAnswerInput(compareButton);
  const actionRow = compareButton.parentElement;

  if (answerInput && actionRow) {
    const commonContainer = findCommonExerciseContainer(answerInput, actionRow);
    if (commonContainer) {
      return commonContainer;
    }
  }

  return (
    compareButton.closest("[id^='translation_submit_']")?.parentElement?.parentElement ||
    compareButton.closest(".translation_sentence_div")?.parentElement ||
    compareButton.closest(".course-content") ||
    document.body
  );
}

function findCommonExerciseContainer(firstElement, secondElement) {
  const firstAncestors = getAncestorChain(firstElement);
  const secondAncestors = getAncestorChain(secondElement);

  return firstAncestors.find((ancestor) => {
    if (ancestor === document.body) {
      return false;
    }

    return secondAncestors.includes(ancestor) && ancestor.querySelector(SELECTORS.chinese);
  }) || null;
}

function getAncestorChain(element) {
  const ancestors = [];
  let current = element;

  while (current instanceof HTMLElement) {
    ancestors.push(current);
    current = current.parentElement;
  }

  return ancestors;
}

function getScopedPromptText(compareButton, exerciseScope, selector) {
  const answerInput = getIndexedAnswerInput(compareButton) || getSiblingAnswerInput(compareButton);

  const scopedMatches = [...exerciseScope.querySelectorAll(selector)]
    .filter((element) => isVisible(element))
    .map((element) => ({
      element,
      text: getText(element)
    }))
    .filter((item) => item.text);

  if (scopedMatches.length === 1) {
    return scopedMatches[0].text;
  }

  if (answerInput && scopedMatches.length > 1) {
    const ranked = scopedMatches
      .map((item) => ({
        ...item,
        distance: getDomDistance(item.element, answerInput)
      }))
      .sort((left, right) => left.distance - right.distance);

    return ranked[0]?.text || "";
  }

  return scopedMatches[0]?.text || "";
}

function getReferenceGerman(compareButton, exerciseScope, sentenceId) {
  const actionRow = compareButton.parentElement;
  const sentenceIdCandidate = sentenceId
    ? normalizeWhitespace(document.getElementById(sentenceId)?.innerText || "")
    : "";

  if (sentenceIdCandidate) {
    return sentenceIdCandidate;
  }

  const actionScopedCandidates = [...actionRow.querySelectorAll(SELECTORS.reference), ...exerciseScope.querySelectorAll(SELECTORS.reference)]
    .map((element) => normalizeWhitespace(element.innerText))
    .filter((text) => /[A-Za-zÄÖÜäöüß]/.test(text));

  return actionScopedCandidates[0] || "";
}

function getDomDistance(source, target) {
  const sourceAncestors = getAncestorChain(source);
  const targetAncestors = getAncestorChain(target);
  const sharedAncestor = sourceAncestors.find((ancestor) => targetAncestors.includes(ancestor));

  if (!sharedAncestor) {
    return Number.MAX_SAFE_INTEGER;
  }

  return sourceAncestors.indexOf(sharedAncestor) + targetAncestors.indexOf(sharedAncestor);
}

function findCompareButtons() {
  const exactTextButtons = [
    ...document.querySelectorAll("button, a, input[type='button'], input[type='submit']")
  ].filter((element) => {
    if (!isVisible(element)) {
      return false;
    }

    const text =
      element instanceof HTMLInputElement
        ? normalizeWhitespace(element.value)
        : normalizeWhitespace(element.innerText);

    return text === "比较答案";
  });

  const prioritizedButtons = [
    ...document.querySelectorAll("button.compare-answer"),
    ...document.querySelectorAll("button[id^='translation_submit_']")
  ].filter((element) => isVisible(element));

  const uniqueButtons = new Map();
  for (const button of [...prioritizedButtons, ...exactTextButtons]) {
    uniqueButtons.set(button, button);
  }

  return [...uniqueButtons.values()];
}

function ensureResultCard(actionRow) {
  const next = actionRow.nextElementSibling;
  if (next?.classList?.contains(CARD_CLASS)) {
    return next;
  }

  const card = document.createElement("section");
  card.className = CARD_CLASS;
  actionRow.insertAdjacentElement("afterend", card);
  return card;
}

function syncButtonDimensions(sourceButton, targetButton) {
  const rect = sourceButton.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }

  targetButton.style.width = `${Math.round(rect.width)}px`;
  targetButton.style.height = `${Math.round(rect.height)}px`;
}

function renderJudgeResult(container, _payload, result) {
  const shouldShowIssues = Array.isArray(result.errors) && result.errors.length > 0;
  container.classList.remove("is-loading", "is-error");
  container.innerHTML = `
    <div class="sl-ai-judge-card__title">AI 评判结果</div>
    ${result.summary ? `<p class="sl-ai-judge-summary">${escapeHtml(result.summary)}</p>` : ""}
    ${shouldShowIssues
      ? `
        <div class="sl-ai-judge-section">
          <div class="sl-ai-judge-section__title">问题说明</div>
          ${renderErrors(result.errors)}
        </div>
      `
      : ""}
  `;
}

function renderErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return '<div class="sl-ai-judge-empty">未发现明显问题。</div>';
  }

  return `
    <ul class="sl-ai-judge-list">
      ${errors
        .map(
          (item) => `
            <li>
              <div class="sl-ai-judge-list__head">${escapeHtml(item.text || "未标注")} ${item.suggestion ? `→ ${escapeHtml(item.suggestion)}` : ""}</div>
              <div class="sl-ai-judge-list__body">${escapeHtml(item.reason || "未提供原因")}</div>
            </li>
          `
        )
        .join("")}
    </ul>
  `;
}

function renderMessage(container, message, type) {
  container.classList.remove("is-loading");
  container.classList.toggle("is-error", type === "error");
  container.innerHTML = `
    <div class="sl-ai-judge-card__title">${type === "error" ? "无法评判" : "提示"}</div>
    <div class="sl-ai-judge-card__meta">${escapeHtml(message)}</div>
  `;
}

function getText(element) {
  return normalizeWhitespace(element?.innerText || "");
}

function normalizeWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function isVisible(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createJudgeTraceId() {
  return `judge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function logContentTiming(traceId, label, startTime, details) {
  if (!debugLoggingEnabled) {
    return;
  }

  const duration = typeof startTime === "number" ? `${(performance.now() - startTime).toFixed(1)}ms` : "";
  const prefix = `[AI Judge][content][${traceId}] ${label}`;

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
