const OFF = 0;
const ERROR = 2;

module.exports = {
	env: {
		browser: true,
		commonjs: true,
		es6: true,
		node: true
	},
	extends: "eslint:recommended",
	globals: {
		"Atomics": "readonly",
		"SharedArrayBuffer": "readonly"
	},
	parserOptions: {
		ecmaVersion: 2018
	},
	rules: {
		"indent": [ERROR, "tab", {"SwitchCase": 1}],
		"linebreak-style": [ERROR, "windows"],
		"brace-style": [ERROR, "1tbs"],
		"quotes": [ERROR, "double"],
		"semi": [ERROR, "always"],
		"yoda": [ERROR, "never"],
		"keyword-spacing": [ERROR, {
			before: true,
			after: false,
			overrides: {
				else: {
					after: true
				},
				do: {
					after: true
				},
				case: {
					after: true
				},
				return: {
					after: true
				},
				try: {
					after: true
				},
				var: {
					after: true
				},
				let: {
					after: true
				},
				const: {
					after: true
				},
			}
		}],
		"key-spacing": [ERROR, {
			beforeColon: false,
			afterColon: true
		}],
		"max-len": [ERROR, {
			code: 120,
			ignoreStrings: true,
			ignoreTemplateLiterals: true,
			ignoreRegExpLiterals: true
		}],
		"no-cond-assign": OFF,
		"no-fallthrough": OFF
	}
};