// eslint.config.mjs — проверка кода системы: опечатки в переменных, недостижимый код, лишние объявления.
// Запуск: npm run lint. Foundry этот файл не читает.
import js from "@eslint/js";
import globals from "globals";

// Глобальные объекты Foundry v14 (в браузере они есть, в Node — нет)
const foundryGlobals = Object.fromEntries([
  "foundry", "game", "ui", "canvas", "CONFIG", "CONST", "Hooks", "PIXI",
  "Actor", "Item", "ChatMessage", "Combat", "Combatant", "Roll", "Scene", "User", "Macro", "JournalEntry", "TokenDocument",
  "ActiveEffect", "Token", "Folder", "Playlist", "RollTable", "Cards", "Handlebars",
  "getDocumentClass", "fromUuid", "fromUuidSync", "loadTemplates", "renderTemplate", "getTemplate", "TextEditor",
  "Actors", "Items", "FilePicker", "Dialog", "Application", "FormApplication", "ClientSettings"
].map(k => [k, "readonly"]));

export default [
  { ignores: ["node_modules/**", "packs/**", "codex-1785/**", "books/**", "tools/sources/**", "tools/.cache/**", "lib/**", "**/*.min.js"] },
  js.configs.recommended,
  {
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.browser, ...foundryGlobals } },
    rules: {
      // неиспользуемое — предупреждение, а не ошибка; _имя — нарочно неиспользуемое
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-useless-escape": "off",
      "no-prototype-builtins": "off",
      "no-fallthrough": "warn",
      "no-case-declarations": "off",
      "no-cond-assign": ["error", "except-parens"],
      // гонки: await внутри цикла — не ошибка, но присваивание из устаревшего значения — да
      "require-atomic-updates": "off",
      "no-useless-assignment": "warn"
    }
  },
  {
    // инструменты разработки — в Node
    files: ["tools/**/*.mjs", "*.config.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser, ...foundryGlobals } }
  }
];
