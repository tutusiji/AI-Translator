document.addEventListener("DOMContentLoaded", async () => {
  // Initialize state
  const state = {
    inputText: "",
    outputText: "",
    selectedLanguage: "英汉互译",
    isLanguageDropdownOpen: false,
    isModelDropdownOpen: false,
    translationType: "图标翻译",
    searchHistory: [],
    isTranslating: false,
    error: null,
    apiKey: "",
    models: [
      {
        id: "deepseek-chat",
        object: "model",
        owned_by: "deepseek",
      },
      {
        id: "deepseek-reasoner",
        object: "model",
        owned_by: "deepseek",
      },
    ],
    selectedModel: "deepseek-chat",
    isLoadingModels: false,
    showOutputArea: false,
  };

  let abortController = null;

  // Load state from Chrome storage
  try {
    const result = await chrome.storage.local.get([
      "selectedLanguage",
      "translationType",
      "searchHistory",
      "DEEPSEEK_API_KEY",
      "selectedModel",
    ]);

    if (result.selectedLanguage)
      state.selectedLanguage = result.selectedLanguage;
    if (result.translationType) state.translationType = result.translationType;
    if (result.searchHistory) state.searchHistory = result.searchHistory;
    if (result.DEEPSEEK_API_KEY) state.apiKey = result.DEEPSEEK_API_KEY;
    if (result.selectedModel) state.selectedModel = result.selectedModel;
  } catch (error) {
    console.error("Error loading from storage:", error);
  }

  // Get UI elements
  const welcomeScreen = document.getElementById("welcomeScreen");
  const translationInterface = document.getElementById("translationInterface");
  const apiKeyInput = document.getElementById("apiKey");
  const saveApiKeyButton = document.getElementById("saveApiKey");

  // Show appropriate interface based on API key
  if (!state.apiKey) {
    welcomeScreen.style.display = "flex";
    translationInterface.style.display = "none";
  } else {
    welcomeScreen.style.display = "none";
    translationInterface.style.display = "block";
    initializeTranslationInterface();
  }

  // Add event listener for save API key button
  saveApiKeyButton.addEventListener("click", async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      alert("Please enter a valid API key");
      return;
    }

    try {
      await chrome.storage.local.set({ DEEPSEEK_API_KEY: apiKey });
      state.apiKey = apiKey;
      welcomeScreen.style.display = "none";
      translationInterface.style.display = "block";
      initializeTranslationInterface();
    } catch (error) {
      console.error("Error saving API key:", error);
      alert("Failed to save API key. Please try again.");
    }
  });

  function initializeTranslationInterface() {
    console.log("Initializing translation interface..."); // Debug log

    // Initialize UI elements
    const inputText = document.getElementById("inputText");
    const outputArea = document.getElementById("outputArea");
    const historyList = document.getElementById("historyList");
    const languageDropdown = document.getElementById("languageDropdown");
    const modelDropdown = document.getElementById("modelDropdown");
    const languageDropdownContent = document.getElementById(
      "languageDropdownContent"
    );
    const modelDropdownContent = document.getElementById(
      "modelDropdownContent"
    );
    const selectedLanguage = document.getElementById("selectedLanguage");
    const selectedModel = document.getElementById("selectedModel");
    const clearHistoryButton = document.getElementById("clearHistory");
    const radioButtons = document.querySelectorAll(
      'input[name="translationType"]'
    );

    // Set initial values
    inputText.value = state.inputText;
    outputArea.textContent = state.outputText;
    selectedLanguage.textContent = state.selectedLanguage;
    selectedModel.textContent = state.selectedModel;
    radioButtons.forEach((radio) => {
      if (radio.value === state.translationType) {
        radio.checked = true;
      }
    });

    // Update history list
    updateHistoryList();

    // Add event listeners
    inputText.addEventListener("input", handleInputChange);
    clearHistoryButton.addEventListener("click", handleClearHistory);
    languageDropdown.addEventListener("click", toggleLanguageDropdown);
    modelDropdown.addEventListener("click", toggleModelDropdown);

    // 只监听下拉菜单的外部点击，不影响翻译结果弹窗
    document.addEventListener("click", handleDropdownOutsideClick);

    // Add event listeners for history items
    historyList.addEventListener("click", (e) => {
      const historyItem = e.target.closest(".history-item");
      if (historyItem) {
        const index = Number.parseInt(historyItem.dataset.index);
        const item = state.searchHistory[index];
        if (item) {
          state.inputText = item;
          inputText.value = item;
          state.showOutputArea = true;
          updateOutputArea();
          translateText(item);
        }
      }
    });

    // Add event listeners for dropdown items
    languageDropdownContent.addEventListener("click", (e) => {
      const item = e.target.closest(".dropdown-item");
      if (item) {
        const language = item.dataset.value;
        state.selectedLanguage = language;
        selectedLanguage.textContent = language;
        state.isLanguageDropdownOpen = false;
        languageDropdownContent.style.display = "none";
        chrome.storage.local.set({ selectedLanguage: language });

        if (state.inputText) {
          translateText(state.inputText);
        }
      }
    });

    modelDropdownContent.addEventListener("click", (e) => {
      const item = e.target.closest(".dropdown-item");
      if (item) {
        const model = item.dataset.value;
        state.selectedModel = model;
        selectedModel.textContent = model;
        state.isModelDropdownOpen = false;
        modelDropdownContent.style.display = "none";
        chrome.storage.local.set({ selectedModel: model });

        // 新的逻辑：如果输入框中有内容，直接使用新的模型进行翻译，而不调整输入框大小
        if (inputText.value && inputText.value.trim()) {
          state.inputText = inputText.value;
          translateText(state.inputText); // 直接翻译，不修改 showOutputArea 和调用 updateOutputArea
        }
      }
    });

    // Add event listeners for radio buttons
    radioButtons.forEach((radio) => {
      radio.addEventListener("change", (e) => {
        const type = e.target.value;
        state.translationType = type;
        chrome.storage.local.set({ translationType: type });
      });
    });

    // Function to handle input changes with debounce
    let debounceTimeout;
    function handleInputChange(e) {
      const newText = e.target.value;
      state.inputText = newText;

      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        if (newText.trim()) {
          state.showOutputArea = true;
          updateOutputArea();
          translateText(newText);
        } else {
          state.showOutputArea = false;
          updateOutputArea();
        }
      }, 800);
    }

    // Function to translate text
    async function translateText(text) {
      if (!text || text.trim() === "") {
        state.outputText = "";
        updateOutputArea();
        return;
      }

      if (state.isTranslating) return;

      state.isTranslating = true;
      state.error = null;
      updateOutputArea();

      // 终止上一个请求
      if (abortController) abortController.abort();
      abortController = new AbortController();

      try {
        const response = await fetch(
          "https://api.deepseek.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${state.apiKey}`,
            },
            body: JSON.stringify({
              model: state.selectedModel,
              messages: [
                {
                  role: "system",
                  content:
                    "You are a translation assistant. Provide only the translated text without any explanations or additional text.",
                },
                {
                  role: "user",
                  content: getTranslationPrompt(text, state.selectedLanguage),
                },
              ],
              temperature: 0.1,
              max_tokens: 1000,
            }),
            signal: abortController.signal,
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            `API error: ${errorData.error?.message || response.statusText}`
          );
        }

        const data = await response.json();
        const translatedText = data.choices[0].message.content.trim();
        const cleanedText = translatedText.replace(/^["']|["']$/g, "");

        state.outputText = cleanedText;

        if (!state.searchHistory.includes(text)) {
          state.searchHistory = [
            text,
            ...state.searchHistory.filter((item) => item !== text).slice(0, 19),
          ];
          chrome.storage.local.set({ searchHistory: state.searchHistory });
          updateHistoryList();
        }
      } catch (error) {
        if (error.name === "AbortError") {
          // 被终止不提示
          state.error = null;
        } else {
          console.error("Translation error:", error);
          state.error = error.message || "An error occurred during translation";
        }
      } finally {
        state.isTranslating = false;
        updateOutputArea();
      }
    }

    // Function to get translation prompt based on language
    function getTranslationPrompt(text, language) {
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

    // Function to update the output area
    function updateOutputArea() {
      if (state.isTranslating) {
        outputArea.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
      } else if (state.error) {
        outputArea.innerHTML = `<div class="error">${state.error}</div>`;
      } else {
        outputArea.textContent = state.outputText;
      }
    }

    // Function to update the history list
    function updateHistoryList() {
      if (state.searchHistory.length > 0) {
        historyList.innerHTML = state.searchHistory
          .map(
            (item, index) =>
              `<div class="history-item" data-index="${index}" title="${item}">${item}</div>`
          )
          .join("");
      } else {
        historyList.innerHTML = `<div class="history-item">No translation history</div>`;
      }
    }

    // Function to handle clear history button click
    function handleClearHistory() {
      state.searchHistory = [];
      chrome.storage.local.set({ searchHistory: [] });
      updateHistoryList();
    }

    // Function to toggle language dropdown
    function toggleLanguageDropdown(e) {
      e.stopPropagation();
      state.isLanguageDropdownOpen = !state.isLanguageDropdownOpen;
      state.isModelDropdownOpen = false;
      languageDropdownContent.style.display = state.isLanguageDropdownOpen
        ? "block"
        : "none";
      modelDropdownContent.style.display = "none";
    }

    // Function to toggle model dropdown
    function toggleModelDropdown(e) {
      e.stopPropagation();
      state.isModelDropdownOpen = !state.isModelDropdownOpen;
      state.isLanguageDropdownOpen = false;
      modelDropdownContent.style.display = state.isModelDropdownOpen
        ? "block"
        : "none";
      languageDropdownContent.style.display = "none";
    }

    // 修改后的下拉菜单外部点击处理函数
    function handleDropdownOutsideClick(e) {
      // 只要不是点击在下拉菜单相关区域，则关闭下拉菜单
      if (
        !e.target.closest("#languageDropdown") &&
        !e.target.closest("#languageDropdownContent") &&
        !e.target.closest("#modelDropdown") &&
        !e.target.closest("#modelDropdownContent")
      ) {
        state.isLanguageDropdownOpen = false;
        state.isModelDropdownOpen = false;
        languageDropdownContent.style.display = "none";
        modelDropdownContent.style.display = "none";
      }
    }

    // outputArea 内部点击不隐藏
    outputArea.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }
});
