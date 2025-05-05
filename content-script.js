// Translation icon element
let translationIcon = null;
// Translation popup element
let translationPopup = null;
// Selected text
let selectedText = "";
// Translation settings
const translationSettings = {
  translationType: "图标翻译", // Default: Icon Translation
  selectedLanguage: "英汉互译", // Default: English-Chinese
  selectedModel: "deepseek-chat", // Default: deepseek-chat
  apiKey: "",
};

// 翻译请求控制器
let abortController = null;
// 新增：用于抑制一次 handleTextSelection
let shouldSuppressSelection = false;
// 新增防抖变量
let textSelectionDebounceTimeout = null;
// 新增，用于存储选中文本的坐标
let selectedTextRect = null;

// Initialize when the content script loads
init();

async function init() {
  console.log("Initializing content script...");

  // Load settings from Chrome storage
  try {
    const result = await chrome.storage.local.get([
      "translationType",
      "selectedLanguage",
      "selectedModel",
      "DEEPSEEK_API_KEY",
    ]);

    if (result.translationType) {
      translationSettings.translationType = result.translationType;
    }
    if (result.selectedLanguage) {
      translationSettings.selectedLanguage = result.selectedLanguage;
    }
    if (result.selectedModel) {
      translationSettings.selectedModel = result.selectedModel;
    }
    if (result.DEEPSEEK_API_KEY) {
      translationSettings.apiKey = result.DEEPSEEK_API_KEY;
    }
  } catch (error) {
    console.error("Error loading translation settings:", error);
  }

  // Listen for changes in Chrome storage
  chrome.storage.onChanged.addListener((changes) => {
    for (const key in changes) {
      if (key === "translationType") {
        translationSettings.translationType = changes[key].newValue;
      } else if (key === "selectedLanguage") {
        translationSettings.selectedLanguage = changes[key].newValue;
      } else if (key === "selectedModel") {
        translationSettings.selectedModel = changes[key].newValue;
      } else if (key === "DEEPSEEK_API_KEY") {
        translationSettings.apiKey = changes[key].newValue;
      }
    }
  });

  // Add CSS styles
  const style = document.createElement("style");
  style.textContent = `
    
  `;
  document.head.appendChild(style);

  // Create and insert the icon
  createTranslationIcon();

  // Add event listeners for text selection
  document.addEventListener("mouseup", handleTextSelection, true);
  document.addEventListener("mousedown", handleGlobalClick, true);
}

// Create translation icon
function createTranslationIcon() {
  console.log("Creating translation icon...");

  // Only create if it doesn't exist
  if (translationIcon) {
    console.log("Translation icon already exists");
    return;
  }

  // Create new icon container
  translationIcon = document.createElement("div");
  translationIcon.className = "deepseek-translation-icon";
  translationIcon.style.display = "none";
  translationIcon.style.userSelect = "none"; // 保持选中态，不清除选中的文字

  // Add SVG icon
  translationIcon.innerHTML = `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </svg>
  `;

  // Add click event listener
  translationIcon.addEventListener("click", handleIconClick);

  // Add to document
  document.body.appendChild(translationIcon);
  console.log("Translation icon created and added to document");
}

// 修改后的 handleTextSelection 函数，添加防抖处理，只有有效文字才能触发翻译
function handleTextSelection(event) {
  // 新增：如果需要抑制本次弹窗，则直接返回
  if (shouldSuppressSelection) {
    shouldSuppressSelection = false;
    return;
  }
  // 新增：如果当前有弹窗且点击在弹窗内，则不做任何操作
  if (
    translationPopup &&
    event.target &&
    translationPopup.contains(event.target)
  ) {
    return;
  }

  // 防抖处理：清除之前的定时器
  clearTimeout(textSelectionDebounceTimeout);
  textSelectionDebounceTimeout = setTimeout(() => {
    // 防止防抖回调时 suppress 标志已被重置，需再次判断
    if (shouldSuppressSelection) {
      shouldSuppressSelection = false;
      return;
    }

    console.log("Text selection debounce triggered");

    const selection = window.getSelection();
    const newSelectedText = selection.toString().trim();

    // 如果选中的内容为空或者只包含空格，不执行翻译
    if (!newSelectedText || newSelectedText.replace(/\s/g, "") === "") {
      selectedText = "";
      selectedTextRect = null;
      if (translationIcon) {
        translationIcon.style.display = "none";
      }
      removeTranslationPopup();
      return;
    }

    // 更新选中的文本和坐标
    selectedText = newSelectedText;
    const range = selection.getRangeAt(0);
    selectedTextRect = range.getBoundingClientRect();
    console.log("New text selected:", selectedText, selectedTextRect);

    // 根据翻译类型执行不同逻辑
    if (translationSettings.translationType === "立即翻译") {
      console.log("Immediate translation triggered");
      const rect = selectedTextRect;
      showTranslationPopup(selectedText, rect);
      translateText(selectedText).then((result) => {
        console.log("Translation result:", result);
        const translatedElement = translationPopup.querySelector(
          ".deepseek-translation-popup-translated"
        );
        if (translatedElement) {
          translatedElement.innerHTML = result;
        }
      });
    } else if (translationSettings.translationType === "图标翻译") {
      // 使用鼠标松开时的位置来显示图标
      const x = event.clientX;
      const y = event.clientY;
      console.log("Showing translation icon at mouseup coordinate:", x, y);
      showTranslationIcon(x, y);
    }
  }, 300);
}

// Show translation icon at the specified position
function showTranslationIcon(x, y) {
  if (!translationIcon) {
    console.error("Translation icon not found");
    return;
  }

  // Position the icon at the mouse position
  translationIcon.style.left = `${x - 25}px`;
  translationIcon.style.top = `${y - 25}px`;
  translationIcon.style.display = "flex";
  console.log("Translation icon displayed at position:", x, y);
}

// Show translation popup
function showTranslationPopup(originalText, rect) {
  // Remove existing popup if any
  removeTranslationPopup();

  console.log("Showing translation popup for text:", originalText);
  console.log("At position:", rect.left, rect.bottom);

  // Create new popup
  translationPopup = document.createElement("div");
  translationPopup.className = "deepseek-translation-popup";

  // Make sure we have text to display
  const displayText = originalText || selectedText || "(No text selected)";

  // Add content to popup
  translationPopup.innerHTML = `
    <div class="deepseek-translation-popup-content">
      <div class="deepseek-translation-popup-header">
        <span class="deepseek-translation-popup-title">AI Translator 翻译结果</span>
        <button class="deepseek-translation-popup-copy" title="复制翻译结果">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style="vertical-align:middle;">
            <rect x="6" y="6" width="9" height="9" rx="2" stroke="#888" stroke-width="1.5" fill="none"/>
            <rect x="3" y="3" width="9" height="9" rx="2" stroke="#bbb" stroke-width="1" fill="none"/>
          </svg>
        </button>
        <button class="deepseek-translation-popup-close">×</button>
      </div>
      <div class="deepseek-translation-popup-body">
        <div class="deepseek-translation-popup-original">${displayText}</div>
        <div class="deepseek-translation-popup-translated">
          <div class="loading">
            <div class="spinner"></div>
            <span>Translating...</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Set explicit styles to ensure visibility
  translationPopup.style.position = "fixed";
  translationPopup.style.left = `${rect.left}px`;
  translationPopup.style.top = `${rect.bottom + 10}px`;
  translationPopup.style.width = "300px";
  translationPopup.style.backgroundColor = "#ffffff";
  translationPopup.style.borderRadius = "8px";
  translationPopup.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
  translationPopup.style.zIndex = "10000";
  translationPopup.style.maxWidth = "320px";
  translationPopup.style.overflow = "hidden";
  translationPopup.style.display = "block"; // Ensure it's displayed

  // 新弹窗时终止上一个请求
  if (abortController) abortController.abort();
  abortController = null;

  // 复制按钮事件
  const copyButton = translationPopup.querySelector(
    ".deepseek-translation-popup-copy"
  );
  if (copyButton) {
    copyButton.addEventListener("click", (e) => {
      e.stopPropagation();
      const translatedElement = translationPopup.querySelector(
        ".deepseek-translation-popup-translated"
      );
      let text = "";
      if (translatedElement) {
        // 只复制纯文本
        text =
          translatedElement.innerText || translatedElement.textContent || "";
      }
      if (text) {
        navigator.clipboard.writeText(text);
        // 临时修改title为“已复制”
        const oldTitle = copyButton.title;
        copyButton.title = "已复制";
        setTimeout(() => {
          copyButton.title = oldTitle;
        }, 1000);
      }
    });
    // 悬停时显示提示（已通过title属性实现）
  }

  // Add close button event listener
  const closeButton = translationPopup.querySelector(
    ".deepseek-translation-popup-close"
  );
  closeButton.addEventListener("click", (e) => {
    e.stopPropagation();
    // 终止请求
    if (abortController) abortController.abort();
    abortController = null;
    // 隐藏弹窗
    removeTranslationPopup();
    // 抑制紧接着的 mouseup 弹窗
    shouldSuppressSelection = true;
  });

  // Add to document
  document.body.appendChild(translationPopup);
  console.log("Translation popup added to document");
}

// Handle translation icon click
function handleIconClick(event) {
  // 防止 handleGlobalClick 关闭弹窗
  shouldSuppressSelection = true;

  // Prevent default actions but DO NOT clear selection
  event.stopPropagation();
  event.preventDefault();

  console.log("Translation icon clicked");

  // Store the selection for future reference
  const selection = window.getSelection();
  const selectionText = selection.toString().trim();

  // Make sure we have the latest selected text
  if (selectionText && selectionText !== selectedText) {
    selectedText = selectionText;
  }

  console.log("Selected text for translation:", selectedText);

  // 使用之前存储的坐标，否则回退到当前选区
  const rect =
    selectedTextRect ||
    (selection.rangeCount
      ? selection.getRangeAt(0).getBoundingClientRect()
      : { left: 0, bottom: 0 });

  console.log("Popup will be shown at:", rect);

  // Show the popup immediately with loading state
  showTranslationPopup(selectedText, rect);

  // Translate the selected text
  translateText(selectedText).then((result) => {
    console.log("Translation completed:", result);

    // Update the popup with the translation result
    if (translationPopup) {
      const translatedElement = translationPopup.querySelector(
        ".deepseek-translation-popup-translated"
      );
      if (translatedElement) {
        translatedElement.innerHTML = result;
        console.log("Translation popup updated with result");
      } else {
        console.error("Translation element not found in popup");
      }
    } else {
      console.error("Translation popup not found when updating result");
      // If popup was removed, recreate it
      showTranslationPopup(selectedText, rect);
      setTimeout(() => {
        const translatedElement = translationPopup.querySelector(
          ".deepseek-translation-popup-translated"
        );
        if (translatedElement) {
          translatedElement.innerHTML = result;
        }
      }, 100);
    }
  });

  // Hide the icon after translation
  if (translationIcon) {
    translationIcon.style.display = "none";
  }
}

// Remove translation icon
function removeTranslationIcon() {
  // Only remove if it exists
  if (translationIcon) {
    translationIcon.remove();
    translationIcon = null;
    console.log("Translation icon removed");
  }
}

// Remove translation popup
function removeTranslationPopup() {
  if (translationPopup) {
    translationPopup.remove();
    translationPopup = null;
  }
  // 保证弹窗关闭时图标也隐藏
  if (translationIcon) {
    translationIcon.style.display = "none";
  }
}

// 修改后的 handleGlobalClick：点击翻译图标时不隐藏弹窗
function handleGlobalClick(event) {
  // 如果点击在翻译图标上，保留弹窗
  if (translationIcon && translationIcon.contains(event.target)) {
    return;
  }

  // 如果没有弹窗，直接返回
  if (!translationPopup) return;

  // 如果点击在弹窗内，忽略
  if (translationPopup.contains(event.target)) return;

  // 否则关闭弹窗并终止请求
  removeTranslationPopup();
  if (abortController) abortController.abort();
  abortController = null;

  // 新增：抑制紧接着的 mouseup 弹窗
  shouldSuppressSelection = true;
}

// Function to get translation prompt based on language
function getTranslationPrompt(text, language) {
  if (!text || text.trim() === "") {
    return "Please provide text to translate.";
  }

  if (language === "英汉互译") {
    const isEnglish = /^[a-zA-Z0-9\s.,!?;:'"-]+$/.test(text);
    return isEnglish
      ? `Translate the following English text to Chinese: "${text}"`
      : `Translate the following Chinese text to English: "${text}"`;
  } else {
    const languageMap = {
      英汉互译: "Chinese",
      英日互译: "Japanese",
      印尼语: "Indonesian",
      葡萄牙语: "Portuguese",
      法语: "French",
      泰语: "Thai",
      葡萄利语: "Portuguese",
    };

    const targetLang = languageMap[language] || "Chinese";
    return `Translate the following text to ${targetLang}: "${text}"`;
  }
}

// Translate text
async function translateText(text) {
  try {
    if (!translationSettings.apiKey) {
      return "Error: API key not set. Please set your DeepSeek API key in the extension popup.";
    }

    console.log("Translating text:", text);
    console.log(
      "Using API key:",
      translationSettings.apiKey.substring(0, 5) + "..."
    );
    console.log("Selected language:", translationSettings.selectedLanguage);
    console.log("Selected model:", translationSettings.selectedModel);

    // Send message to background script to handle the translation
    const translationPrompt = getTranslationPrompt(
      text,
      translationSettings.selectedLanguage
    );
    console.log("Translation prompt:", translationPrompt);

    // 支持终止请求
    if (abortController) abortController.abort();
    abortController = new AbortController();

    // Directly make the API request in content script for debugging
    const response = await fetch(
      "https://api.deepseek.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${translationSettings.apiKey}`,
        },
        body: JSON.stringify({
          model: translationSettings.selectedModel,
          messages: [
            {
              role: "system",
              content:
                "You are a translation assistant. Provide only the translated text without any explanations or additional text.",
            },
            {
              role: "user",
              content: translationPrompt,
            },
          ],
          temperature: 0.1,
          max_tokens: 1000,
        }),
        signal: abortController.signal,
      }
    );

    console.log("API response status:", response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error("API error data:", errorData);
      throw new Error(
        `API error: ${errorData.error?.message || response.statusText}`
      );
    }

    const data = await response.json();
    console.log("API response data:", data);

    const translatedText = data.choices[0].message.content.trim();
    const cleanedText = translatedText.replace(/^["']|["']$/g, "");

    console.log("Translated text:", cleanedText);

    // Add to history (but not for selection translations)
    if (
      translationSettings.translationType !== "图标翻译" &&
      translationSettings.translationType !== "立即翻译"
    ) {
      const currentHistory = await chrome.storage.local.get("searchHistory");
      let searchHistory = currentHistory.searchHistory || [];

      if (!searchHistory.includes(text)) {
        searchHistory = [
          text,
          ...searchHistory.filter((item) => item !== text).slice(0, 19),
        ];
        chrome.storage.local.set({ searchHistory: searchHistory });
      }
    }

    abortController = null; // 请求完成后清空
    return cleanedText;
  } catch (error) {
    if (error.name === "AbortError") {
      // 被终止时不显示错误
      return "";
    }
    abortController = null;
    console.error("Translation error:", error);
    return `Error: ${error.message || "Unknown error occurred"}`;
  }
}

// 全局点击处理：点击非弹窗区域关闭弹窗并终止请求
function handleGlobalClick(event) {
  // 如果点击在翻译图标上，保留弹窗
  if (translationIcon && translationIcon.contains(event.target)) {
    return;
  }

  // 如果没有弹窗，直接返回
  if (!translationPopup) return;

  // 如果点击在弹窗内，忽略
  if (translationPopup.contains(event.target)) return;

  // 否则关闭弹窗并终止请求
  removeTranslationPopup();
  if (abortController) abortController.abort();
  abortController = null;

  // 新增：抑制紧接着的 mouseup 弹窗
  shouldSuppressSelection = true;
}
