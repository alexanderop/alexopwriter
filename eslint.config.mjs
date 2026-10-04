import architecture from './tooling/oxlint-plugin.mjs'
import ui from './tooling/ui-conventions.mjs'
import pluginVue from "eslint-plugin-vue"
import tseslint from "typescript-eslint"
import vueParser from "vue-eslint-parser"

export default [
  {
    ignores: ["dist/**", "out/**", "playwright-report/**", "test-results/**"]
  },
  {
    files: ["src/**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaVersion: "latest",
        extraFileExtensions: [".vue"],
        parser: tseslint.parser,
        sourceType: "module"
      }
    },
    plugins: { vue: pluginVue, "writer-architecture": architecture, "writer-ui": ui },
    rules: {
      "writer-architecture/boundaries": "error",
      "writer-ui/shared-controls": "error",
      "vue/attribute-hyphenation": ["error", "always"],
      "vue/component-name-in-template-casing": [
        "error",
        "PascalCase",
        { registeredComponentsOnly: false }
      ],
      "vue/custom-event-name-casing": ["error", "kebab-case"],
      "vue/match-component-file-name": [
        "error",
        { extensions: ["vue"], shouldMatchCase: true }
      ],
      "vue/max-template-depth": ["error", { maxDepth: 8 }],
      "vue/multi-word-component-names": [
        "error",
        { ignores: ["App", "Button", "Input", "Textarea", "Kbd", "Kicker"] }
      ],
      "vue/no-unused-emit-declarations": "error",
      "vue/no-unused-properties": [
        "error",
        { groups: ["props", "data", "computed", "methods"] }
      ],
      "vue/prefer-use-template-ref": "error"
    }
  }
]
