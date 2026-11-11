import sonarjs from 'eslint-plugin-sonarjs'

export default [{
  files: ['src/**/*.{js,jsx}', 'server/**/*.js'],
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } }
  },
  plugins: { sonarjs },
  rules: {
    'sonarjs/cognitive-complexity': ['error', 10]
  }
}]