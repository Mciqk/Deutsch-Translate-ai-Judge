const summary = document.getElementById("summary");
const openOptionsButton = document.getElementById("openOptionsButton");

openOptionsButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "OPEN_OPTIONS_PAGE" });
  window.close();
});

void loadStatus();

async function loadStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_CONFIG_STATUS" });
    if (!response?.success) {
      throw new Error(response?.error || "未知错误");
    }

    if (response.data.configured) {
      summary.textContent = `已配置模型 ${response.data.model}，可直接回 Sharplingo 页面点击 AI评判。`;
      return;
    }

    summary.textContent = "还没配置 API。先打开设置页填写 Base URL、Key 和模型名。";
  } catch (error) {
    summary.textContent = `读取状态失败：${error instanceof Error ? error.message : String(error)}`;
  }
}
