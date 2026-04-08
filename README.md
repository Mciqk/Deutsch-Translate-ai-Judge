# Sharplingo AI Judge MVP

一个可本地加载的 Chrome/Edge Manifest V3 扩展。

能力：

- 在 `https://www.sharplingo.cn/courses/show-video/*` 页面注入 `AI评判` 按钮
- 读取中文原句、英文辅助原句、用户德语答案、页面显示的参考答案
- 调用用户自定义的 OpenAI 兼容接口
- 把结构化评判结果渲染回页面

## 文件

- `manifest.json`: 扩展入口
- `content.js`: 页面注入、读题、结果渲染
- `background.js`: 读取配置并调用模型 API
- `options.html` / `options.js`: API 配置页
- `popup.html` / `popup.js`: 快速打开设置页

## 加载方法

1. 打开 Chrome 或 Edge
2. 进入 `chrome://extensions/`
3. 打开右上角“开发者模式”
4. 点击“加载已解压的扩展程序”
5. 选择当前项目目录

## 配置方法

1. 打开扩展弹窗，点击“打开设置页”
2. 填写：
   - `API Base URL`，例如 `https://api.openai.com/v1`
   - `API Key`
   - `模型名`
3. 点击“保存配置”
4. 首次保存时，扩展会申请该 API 域名的访问权限

配置说明：

- `API Base URL`、`API Key`、模型名和提示词模板保存在浏览器的 `chrome.storage.sync` 中
- 这些运行时配置不在仓库里，不会随源码上传到 GitHub

## 使用方法

1. 打开 Sharplingo 的句子翻译练习页
2. 输入德语答案
3. 点击页面里的 `AI评判`
4. 等待结果卡片返回

## 备注

- 这个 MVP 假定页面结构与 PDF 里给出的选择器一致：
  - 中文：`span.translation-chinese-span`
  - 英文：`span.translation-span`
  - 输入框：`textarea.translation_sentence_textarea`
  - 参考答案：`.sentence-div.sentence`
- 如果 Sharplingo 改了 DOM 结构，需要微调 `content.js`
