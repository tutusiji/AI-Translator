// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "translate") {
    handleTranslation(request, sendResponse);
    return true; // Required for async response
  }
});

// Handle translation request
async function handleTranslation(request, sendResponse) {
  try {
    const response = await fetch(
      "https://api.deepseek.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${request.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages: [
            {
              role: "system",
              content:
                "You are a translation assistant. Provide only the translated text without any explanations or additional text.",
            },
            {
              role: "user",
              content: getTranslationPrompt(request.text, request.language),
            },
          ],
          temperature: 0.1,
          max_tokens: 1000,
        }),
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

    sendResponse({ translatedText: cleanedText });
  } catch (error) {
    console.error("Translation error:", error);
    sendResponse({ error: error.message || "Unknown error occurred" });
  }
}

// Function to get translation prompt based on language
function getTranslationPrompt(text, language) {
  // 英汉、中日等互译类型，需判断内容语言
  const mutualMap = {
    英汉互译: {
      langA: "English",
      langB: "Chinese",
      regex: /^[a-zA-Z0-9\s.,!?;:'"\-]+$/,
    },
    中日互译: {
      langA: "Chinese",
      langB: "Japanese",
      // 判断是否为中文（包含汉字）
      regex: /[\u4e00-\u9fa5]/,
    },
  };

  if (mutualMap[language]) {
    const { langA, langB, regex } = mutualMap[language];
    const isLangA = regex.test(text);
    return isLangA
      ? `Translate the following ${langA} text to ${langB}: "${text}"`
      : `Translate the following ${langB} text to ${langA}: "${text}"`;
  } else {
    // 其它类型，直接目标语言
    const languageMap = {
      英汉互译: "Chinese",
      中日互译: "Japanese",
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
