# DeepSeek Translator Chrome Extension

A Chrome extension for translating text using DeepSeek AI.

## Development

1. Install dependencies:
   \`\`\`
   npm install
   \`\`\`

2. Run development server:
   \`\`\`
   npm run dev
   \`\`\`

3. Build the extension:
   \`\`\`
   npm run build-extension
   \`\`\`

## Loading the Extension in Chrome

1. Build the extension using `npm run build-extension`
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked" and select the `extension-dist` directory
5. The extension should now be loaded and ready to use

## Features

- Translate selected text on any webpage
- Multiple translation modes:
  - Icon Translation: Shows an icon when text is selected, click to translate
  - Immediate Translation: Automatically translates selected text
  - Disable Selection: Turns off the translation feature
- Multiple language pairs support
- DeepSeek AI model selection
- Translation history
