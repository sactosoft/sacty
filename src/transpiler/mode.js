var Polyfill = require("../polyfill");
var Parser = require("./parser");
var { optimize, stringify } = require("./util");

var modeRegistry = [];
var modeNames = {};
var defaultMode;

/**
 * @since 0.15.0
 */
function defineMode(names, parser, isDefault) {
	var id = modeRegistry.length;
	modeRegistry.push({
		name: names[0],
		parser: parser
	});
	names.forEach(function(name){
		modeNames[name] = id;
	});
	if(isDefault) defaultMode = id;
	return id;
}

/**
 * @since 0.35.0
 */
function startMode(mode, transpiler, parser, source, attributes, parent) {
	var m = modeRegistry[mode];
	var ret = new m.parser(transpiler, parser, source, attributes || {}, parent);
	ret.options = parser.options = m.parser.getOptions();
	return ret;
}

/**
 * @class
 * @since 0.15.0
 */
function Mode(transpiler, parser, source, attributes) {
	this.transpiler = transpiler;
	this.parser = parser;
	this.source = source;
	this.runtime = transpiler.runtime;
	this.es6 = transpiler.options.es6;
	this.attributes = attributes;
}

/**
 * @since 0.144.0
 */
Mode.prototype.usedAttributes = function(){
	return [];
};

Mode.prototype.add = function(text){
	return this.source.push(text);
};

/**
 * @since 0.69.0
 */
Mode.prototype.parseCode = function(fun, trackable){
	this.parser.parseTemplateLiteral = null;
	var expr = Parser.prototype[fun].apply(this.parser, Array.prototype.slice.call(arguments, 2));
	this.transpiler.updateTemplateLiteralParser();
	return this.transpiler.parseCode(expr, this.parser, trackable);
};

Mode.prototype.parseCodeToSource = function(fun, trackable){
	var expr = Parser.prototype[fun].apply(this.parser, Array.prototype.slice.call(arguments, 2));
	return this.transpiler.parseCode(expr, this.parser, trackable).source;
};

Mode.prototype.parseCodeToValue = function(/*fun*/){
	return this.parseCode.apply(this, arguments).toValue();
};

Mode.prototype.start = function(){};

Mode.prototype.end = function(){};

Mode.prototype.chainAfter = function(){};

Mode.prototype.parse = function(/*handle, eof*/){};

/**
 * @class
 * @since 0.29.0
 */
function BreakpointMode(transpiler, parser, source, attributes, breakpoints) {
	Mode.call(this, transpiler, parser, source, attributes);
	this.breakpoints = ["<"].concat(breakpoints);
}

BreakpointMode.prototype = Object.create(Mode.prototype);

BreakpointMode.prototype.next = function(/*match*/){};

BreakpointMode.prototype.parse = function(handle, eof){
	var result = this.parser.find(this.breakpoints, false, true);
	if(result.pre) this.add(result.pre);
	if(result.match == "<") {
		if(this.parser.couldStartRegExp() && this.parser.input.charAt(this.parser.index - 2) != "<") {
			handle();
		} else {
			// just a comparison or left shift
			this.add("<");
			this.parser.last = "<";
			this.parser.lastIndex = this.parser.index;
		}
	} else if(result.match) {
		this.next(result.match);
	} else {
		eof();
	}
};

/**
 * Basic parser that recognises text, expressions (both textual and mixin)
 * and new tags.
 * @class
 * @since 0.28.0
 */
function TextExprMode(transpiler, parser, source, attributes) {
	Mode.call(this, transpiler, parser, source, attributes);
	this.current = [];
	this.chain = [];
	this.chainable = true;
}

TextExprMode.prototype = Object.create(Mode.prototype);

/**
 * Adds text to the chain.
 */
TextExprMode.prototype.addText = function(expr){
	this.chain.push(["text", expr]);
};

/**
 * Adds whitespace to the chain.
 */
TextExprMode.prototype.addSpace = function(space){
	// eslint-disable-next-line no-sparse-arrays
	this.chain.push([, space]);
};

/**
 * Parses and adds the current text to the chain.
 */
TextExprMode.prototype.addCurrent = function(){
	let first;
	if(this.attributes.trimmed && this.current.length == 1 && (first = this.current[0]).text && /^\s*$/.test(first.value)) {
		// just whitespace
		this.addSpace(first.value);
	} else {
		const expr = this.current.filter(c => !c.text || c.value.length);
		if(expr.length) {
			// create joined
			let joined = this.es6 ?
				`\`${expr.map(({text, value}) => text ? this.replaceText(value).replace(/(`|\$|\\)/gm, "\\$1") : "${" + value.source + "}").join("")}\`` :
				`"" + ${expr.map(({text, value}) => text ? stringify(this.replaceText(value)) : `(${value.source})`).join(" + ")}`;
			// check observable
			const observables = !!Polyfill.find.call(expr, ({text, value}) => !text && value.observables);
			if(observables) {
				joined = `${this.transpiler.feature("coff")}(${this.source.getContext()}, ${this.es6 ? `(${this.transpiler.tracker}) => ${joined}` : `function(${this.transpiler.tracker}){return ${joined}}.bind(this)`})`;
			}
			this.addText(joined);
		}
	}
	this.current = [];
};

/**
 * Closes the current chain. Either because a new tag is being opened
 * or because or a non-chainable operation is being started.
 * @since 0.128.0
 */
TextExprMode.prototype.endChain = function(){
	this.addCurrent();
	// add compiled data to source
	var source = "";
	var empty = true;
	this.chain.forEach(data => {
		var type = data.shift();
		if(type) {
			// text or mixin
			empty = false;
			source += `, [${this.transpiler.chainFeature(type)}, ${data.join("")}]`;
		} else {
			// whitespace
			source += data[0];
		}
	});
	if(!empty) {
		this.source.addSource(`${this.transpiler.chain}(${this.source.getContext()}${source});`);
	} else {
		this.source.addSource(source);
	}
	this.chain = [];
};

/**
 * Closes the current chain and indicates that the whole parses cannot be used
 * as a single chain no more.
 */
TextExprMode.prototype.endChainable = function(){
	this.endChain();
	this.chainable = false;
};

/**
 * @deprecated
 */
TextExprMode.prototype.addFinalCurrent = function(){
	this.endChain();
};

/**
 * Adds text to the current data.
 */
TextExprMode.prototype.pushText = function(value){
	var last = this.current[this.current.length - 1];
	if(last && last.text) last.value += value;
	else this.current.push({text: true, value});
};

/**
 * Adds a code expression to the current data.
 */
TextExprMode.prototype.pushExpr = function(value){
	this.current.push({text: false, value});
};

/**
 * Removes whitespaces from the end of the current data.
 * @returns The trimmed text.
 */
TextExprMode.prototype.trimEnd = function(){
	var ret = "";
	var end = this.current[this.current.length - 1];
	if(end && end.text) {
		var trimmed = Polyfill.trimEnd.call(end.value);
		ret = end.value.substr(trimmed.length);
		end.value = trimmed;
	}
	return ret;
};

TextExprMode.prototype.replaceText = function(text){
	return text;
};

TextExprMode.prototype.handle = function(){
	return true;
};

TextExprMode.prototype.parseImpl = function(pre, match, handle, eof){
	switch(match) {
		case "$":
		case "#":
		case "%":
		case "@":
			if(this.parser.peek() == "{") {
				if(pre.slice(-1) == "\\") {
					const last = this.current[this.current.length - 1];
					last.value = last.value.slice(0, -1) + match;
					break;
				} else {
					const expr = this.parseCode("skipEnclosedContent", true, true);
					if(match == "#") {
						this.addCurrent();
						let source = expr.source;
						if(expr.observables) {
							if(this.es6) {
								source = `${this.transpiler.tracker} => ${source}`;
							} else {
								source = `function(${this.transpiler.tracker}){return ${source}}.bind(this)`;
							}
							source = `${this.runtime}.coff(${this.source.getContext()}, ${source})`;
						}
						this.chain.push(["html", source]);
					} else {
						if(match == "%") {
							expr.source = `${this.transpiler.runtime}.stringify(${expr.source})`;
						} else if(match == "@") {
							expr.source = `${this.transpiler.runtime}.quote(${expr.source})`;
						}
						this.pushExpr(expr);
					}
				}
			} else {
				this.pushText(match);
			}
			break;
		case "<":
			if(this.handle()) {
				if(this.parser.peek() == "/") {
					// tag is being closed, chainable is not modified
					this.endChain();
				} else {
					// another tag is being opened, cannot chain
					this.endChainable();
				}
				handle();
			} else {
				this.pushText("<");
			}
			break;
		default:
			this.endChain();
			eof();
	}
};

TextExprMode.prototype.parse = function(handle, eof){
	var result = this.parser.find(["<", "$", "#", "%", "@"], false, true);
	this.pushText(result.pre);
	this.parseImpl(result.pre, result.match, handle, eof);
};

/**
 * @class
 * @since 0.53.0
 */
function LogicMode(transpiler, parser, source, attributes) {
	TextExprMode.call(this, transpiler, parser, source, attributes);
	this.count = 0;
	this.statements = [];
	this.popped = [];
}

LogicMode.prototype = Object.create(TextExprMode.prototype);

LogicMode.prototype.getLineText = function(){
	var last = this.current[this.current.length - 1];
	if(last && last.text) {
		var index = last.value.lastIndexOf("\n");
		if(index != -1) {
			return last.value.substr(index);
		}
	}
	return false;
};

LogicMode.prototype.parseIf = function(expected, checkLine = true){
	let line;
	if(
		// when the expected keyword is found
		this.parser.input.substr(this.parser.index, expected.length - 1) == expected.substr(1)
		// and when it is at the start of line
		&& (!checkLine || ((line = this.getLineText()) && !/\S/.test(line)))
		// and when it is an exact keyword
		&& !/[a-zA-Z0-9_$]/.test(this.parser.input.charAt(this.parser.index + expected.length - 1))
	) {
		return true;
	} else {
		if(line && line.slice(-1) == "\\") {
			var curr = this.current[this.current.length - 1];
			curr.value = curr.value.slice(0, -1);
		}
		return false;
	}
};

LogicMode.prototype.parseStatement = function(statement, trimmed, expected, condition, following){
	const index = this.parser.index;
	this.parser.index += expected.length - 1;
	let part;
	const init = () => {
		this.endChainable();
		this.add(trimmed);
		if(!statement.startRef) {
			statement.startRef = this.source.addIsolatedSource("");
		}
		statement.parts.push(part = {
			type: expected,
			following,
			observables: false,
			declStart: this.source.addIsolatedSource("")
		});
	};
	if(condition === 1) {
		// with condition (e.g. `statement(condition)`)
		let skipped = this.parser.skipImpl({comments: true});
		if(this.parser.peek() != "(") {
			// restore skipped code and fail to start the statement
			this.parser.index = index;
			this.pushText(trimmed);
			return false;
		}
		init();
		this.parser.parseTemplateLiteral = null;
		const reparse = (s, parser) => {
			const {source, observables} = this.transpiler.parseCode(s, parser, true);
			statement.observables |= observables;
			part.observables |= observables;
			return source;
		};
		const position = this.parser.position;
		const source = this.parser.skipEnclosedContent();
		if(expected == "foreach") {
			const parser = new Parser(source.slice(1, -1), position);
			Polyfill.assign(parser.options, {comments: true, strings: true, regexp: true});
			skipped += parser.skipImpl({comments: true});
			let expr, from, to;
			// `from` and `to` need to be reparsed searching for observables as `from` and `to`
			// are only keywords in this specific context
			if(Polyfill.startsWith.call(parser.input.substr(parser.index), "from ")) {
				parser.index += 5;
				from = reparse(parser.readExpression());
				parser.expectSequence("to ");
				to = reparse(parser.readExpression());
			} else if(Polyfill.startsWith.call(parser.input.substr(parser.index), "to ")) {
				parser.index += 3;
				from = "0";
				to = reparse(parser.readExpression());
			} else {
				statement.unparsed = parser.readExpression();
				expr = reparse(statement.unparsed);
			}
			let rest = "";
			if(parser.input.substr(parser.index, 3) == "as ") {
				parser.index += 3;
				rest = parser.input.substr(parser.index);
			}
			if(expr) {
				let key, column = rest.indexOf(":");
				if(column == -1 || (key = rest.substring(0, column)).indexOf("{") != -1 || key.indexOf("[") != -1) {
					// divided in 4 parts so it can be modified later
					statement.ref.a = this.source.addIsolatedSource(this.transpiler.feature("forEachArray") + "(");
					statement.ref.b = this.source.addIsolatedSource(expr);
					if(this.es6) {
						statement.ref.c = this.source.addIsolatedSource(", (");
						this.source.addIsolatedSource(rest + ") =>");
					} else {
						statement.ref.c = this.source.addIsolatedSource(", function(");
						this.source.addIsolatedSource(rest + ")");
					}
				} else {
					// object
					statement.type = part.type = "object-foreach";
					rest = key + "," + rest.substr(column + 1);
					this.source.addSource(`${this.transpiler.feature("forEachObject")}(${expr}, ${this.es6 ? `(${rest}) =>` : `function(${rest})`}`);
				}
			} else {
				statement.type = part.type = "range";
				this.source.addSource(`${this.transpiler.feature("range")}(${from}, ${to}, ${this.es6 ? `(${rest}) =>` : `function(${rest})`}`);
			}
			if(!this.es6) statement.end += ".bind(this)";
			statement.end += ");";
			statement.inlineable = false;
		} else {
			part.decl = this.source.addIsolatedSource(expected + skipped + reparse(source));
		}
	} else {
		// without condition
		init();
		part.decl = this.source.addIsolatedSource(expected);
	}
	this.source.addSource(this.parser.skipImpl({comments: true}));
	if(!(statement.inline = part.inline = !this.parser.readIf("{")) || !statement.inlineable) {
		this.source.addSource("{");
	}
	part.declEnd = this.source.addIsolatedSource("");
	this.statements.push(statement);
	this.onStatementStart(statement);
	return true;
};

LogicMode.prototype.parseLogic = function(expected, type, closing){
	if(this.parseIf(expected)) {
		const trimmed = this.trimEnd();
		if(type === 0) {
			// variable
			this.endChainable(); // variable declarations cannot be chained
			const end = this.parser.find(closing || ["=", ";"], true, {comments: true});
			// add declaration (e.g. `var a =` or `var a;`)
			this.add(trimmed + expected.charAt(0) + end.pre + end.match);
			if(end.match == "=") {
				// add the value/body of the variable
				this.parser.parseTemplateLiteral = null;
				this.add(this.transpiler.parseCode(this.parser.readExpression(), this.parser, true).source);
				if(this.parser.readIf(";")) this.add(";");
			}
			return true;
		} else {
			return this.parseStatement({
				type: expected,
				context: this.source.getContext(),
				observables: false,
				inlineable: true,
				end: "",
				parts: [],
				ref: {}
			}, trimmed, expected, type, closing);
		}
	} else {
		return false;
	}
};

LogicMode.prototype.find = function(){
	return this.parser.find(["$", "#", "%", "@", "<", "c", "l", "v", "b", "d", "i", "f", "w", "s", "}", "\n"], false, false);
};

LogicMode.prototype.parse = function(handle, eof){
	const result = this.find();
	if(result.pre.length) {
		this.pushText(result.pre);
	}
	switch(result.match) {
		case "c":
			if(!this.parseLogic("const", 0) && !this.parseLogic("case", 0, [":"])) this.pushText("c");
			break;
		case "l":
			if(!this.parseLogic("let", 0)) this.pushText("l");
			break;
		case "v":
			if(!this.parseLogic("var", 0)) this.pushText("v");
			break;
		case "b":
			if(!this.parseLogic("break", 0)) this.pushText("b");
			break;
		case "d":
			if(!this.parseLogic("default", 0, [":"])) this.pushText("d");
			break;
		case "i":
			if(!this.parseLogic("if", 1, [["else if", 1, true], ["else", 2, false]])) this.pushText("i");
			break;
		case "f":
			if(!this.parseLogic("foreach", 1) && !this.parseLogic("for", 1)) this.pushText("f");
			break;
		case "w":
			if(!this.parseLogic("while", 1)) this.pushText("w");
			break;
		case "s":
			if(!this.parseLogic("switch", 1)) this.pushText("s");
			break;
		case "}":
			if(result.pre.slice(-1) == "\\") {
				let curr = this.current[this.current.length - 1];
				curr.value = curr.value.slice(0, -1) + "}";
			} else if(this.statements.length) {
				this.closeStatement(false);
			} else {
				this.pushText("}");
			}
			break;
		case "\n":
			if(this.statements.length && this.statements[this.statements.length - 1].inline) {
				this.closeStatement(true);
			} else {
				this.pushText("\n");
			}
			break;
		default:
			this.parseImpl(result.pre, result.match, handle, eof);
	}
};

LogicMode.prototype.closeStatement = function(inline){
	const statement = this.statements.pop();
	const part = statement.parts[statement.parts.length - 1];
	const trimmed = this.trimEnd();
	this.endChainable();
	this.source.addSource(trimmed);
	if(inline) {
		if(!statement.inlineable) {
			this.source.addSource("}");
		}
	}
	statement.endRef = part.close = this.source.addIsolatedSource((inline ? "" : "}") + statement.end);
	this.onStatementEnd(statement);
	if(inline) {
		this.pushText("\n");
	}
	if(part.following) {
		// try to start the next expression
		const trimmed = this.parser.skipImpl({comments: true});
		for(let i=0; i<part.following.length; i++) {
			let [expected, type, following] = part.following[i];
			if(following) following = part.following;
			if(this.parser.readIf(expected.charAt(0))) {
				if(this.parseIf(expected, false)) {
					if(this.parseStatement(statement, trimmed, expected, type, following)) {
						return;
					}
				} else {
					this.parser.index--;
				}
			}
		}
		this.pushText(trimmed);
	}
	this.popped.push(statement);
};

LogicMode.prototype.onStatementStart = function(/*statement*/){};

LogicMode.prototype.onStatementEnd = function(/*statement*/){};

LogicMode.prototype.end = function(){
	this.popped.forEach(popped => {
		if(popped.observables) {
			if(popped.type == "if") {
				// calculate conditions and remove them from source
				let conditions = "";
				const replacement = this.es6 ? `, ${popped.context} =>` : `, function(${popped.context})`;
				popped.parts.forEach((part, i) => {
					const source = part.decl.value.substr(part.type.length);
					if(part.type == "else") {
						conditions += i;
					} else {
						conditions += `${source} ? ${i} : `;
					}
					part.declStart.value = replacement;
					if(part.inline) {
						part.declStart.value += "{";
						part.close.value += "}";
					}
					part.decl.value = "";
				});
				if(popped.parts[popped.parts.length - 1].type != "else") {
					conditions += "-1";
				}
				popped.startRef.value = `${this.transpiler.feature("bindFlowIfElse")}(${popped.context}, ${this.transpiler.tracker} => ${conditions}${popped.startRef.value}`;
				popped.endRef.value += `${this.es6 ? "" : ".bind(this)"});`;
			} else if(popped.type == "foreach") {
				// the source is divided in 4 parts
				let expr = popped.ref.b.value;
				const optimized = optimize(popped.unparsed.trim());
				if(optimized) {
					expr = optimized;
				} else {
					expr = `${this.transpiler.feature("coff")}(${this.source.getContext()}, ${this.es6 ? `${this.transpiler.tracker} => ${expr}` : `function(${this.transpiler.tracker}){return ${expr}}.bind(this)`})`;
				}
				popped.ref.a.value = "";
				popped.ref.b.value = "";
				popped.ref.c.value = `${this.transpiler.feature("bindFlowEach")}(${popped.context}, ${expr}, ${!this.es6 ? "function" : ""}(${popped.context}, `;
				// no need to close as the end is the same as the Sactory.forEach function call
			} else {
				// normal bind
				let start = `${this.transpiler.feature("bindFlow")}(${popped.context}, `;
				let end = "}";
				if(this.es6) {
					start += `${this.transpiler.tracker} => ${popped.context} => `;
				} else {
					start += `function(${this.transpiler.tracker}){return function(${popped.context})`;
					end += ".bind(this)}.bind(this)";
				}
				popped.startRef.value = `${start}{${popped.startRef.value}`;
				popped.endRef.value += `${end});`;
			}
		}
	});
};

/**
 * @class
 * @since 0.99.0
 */
function OptionalLogicMode(transpiler, parser, source, attributes) {
	LogicMode.call(this, transpiler, parser, source, attributes);
	if(!attributes.logic) {
		this.parse = TextExprMode.prototype.parse.bind(this);
	}
}

OptionalLogicMode.prototype = Object.create(LogicMode.prototype);

/**
 * @class
 * @since 0.15.0
 */
function SourceCodeMode(transpiler, parser, source, attributes) {
	BreakpointMode.call(this, transpiler, parser, source, attributes, ["(", ")", "{", "}", "$", "&", "*", "^"]);
	this.parentheses = [];
}

SourceCodeMode.getOptions = function(){
	return {isDefault: true, code: true, comments: true, strings: true, regexp: true};
};

SourceCodeMode.prototype = Object.create(BreakpointMode.prototype);

SourceCodeMode.prototype.restoreIndex = function(char){
	this.add(this.parser.last = char);
	this.parser.lastIndex = this.parser.index - 1;
};

SourceCodeMode.prototype.handleParenthesis = function(match){
	this.restoreIndex(match);
};

SourceCodeMode.prototype.addObservableImpl = function(tracked, name){
	if(name.length) {
		const tail = this.source.tail();
		tail.value = tail.value.slice(0, -name.length);
	}
	const maybe = !!this.parser.readIf("?");
	if(!name.length && this.parser.peek() == "(") {
		name += this.parseCodeToSource("skipEnclosedContent", false);
	} else if(name.length && this.parser.peek() == "[") {
		name = name.slice(0, -1) + this.parseCodeToSource("skipEnclosedContent", this.trackable && tracked);
	} else {
		name += this.parseCodeToSource("readVarName", false, true);
	}
	if(this.trackable && tracked) {
		this.observables = true;
		let skipped = this.parser.skipImpl({comments: true});
		if(this.parser.peek() == ".") {
			// check for child observables
			this.add(`${this.transpiler.tracker}.${maybe ? "d" : "c"}(${name}, `);
			const parsed = this.transpiler.parseCode(this.transpiler.value + skipped + this.parser.readSingleExpression(true), this.parser, true);
			if(this.es6) {
				this.add(`(${this.transpiler.tracker}, ${this.transpiler.value}) => ${parsed.source})`);
			} else {
				this.add(`function(${this.transpiler.tracker}, ${this.transpiler.value}){return ${parsed.source}}.bind(this))`);
			}
		} else {
			this.add(`${this.transpiler.tracker}.${maybe ? "b" : "a"}(${name})${skipped}`);
		}
	} else if(maybe) {
		this.source.addSource(`${this.transpiler.feature("value")}(${name})`);
	} else {
		this.add(`${name}.value`);
	}
	this.parser.last = "]"; // see issue#57
	this.parser.lastIndex = this.parser.index - 1;
};

SourceCodeMode.prototype.addObservable = function(tracked){
	if(this.parser.couldStartRegExp()) {
		this.addObservableImpl(tracked, "");
		return true;
	} else if(this.parser.last == ".") {
		this.addObservableImpl(tracked, this.lookBehind());
		return true;
	} else {
		return false;
	}
};

SourceCodeMode.prototype.lookBehind = function(){
	const tail = this.source.tail();
	let end = tail.value.length;
	let index = end - 1;
	while(index >= 0 && /[\s\u0561-\u0588a-zA-Z0-9_$.]/.test(tail.value.charAt(index))) {
		index--;
	}
	return tail.value.substring(index + 1, end);
};

SourceCodeMode.prototype.next = function(match){
	switch(match) {
		case "(":
			this.parser.parentheses.push({
				lastIndex: this.parser.lastIndex,
				start: this.parser.index
			});
			this.handleParenthesis(match);
			break;
		case ")":
			var popped = this.parser.parentheses.pop();
			if(popped) popped.end = this.parser.index;
			this.parser.lastParenthesis = popped;
			this.handleParenthesis(match);
			break;
		case "{":
			var last = this.parser.last;
			this.restoreIndex("{");
			if(!this.attributes.inAttr && last == ")" && !this.parser.lastKeywordAtIn(this.parser.lastParenthesis.lastIndex, "if", "for", "while", "switch", "catch", "with")) {
				// new function declaration
				const lp = this.parser.lastParenthesis;
				this.source.startFunction(this.parser.input.substring(lp.start, lp.end - 1));
			} else {
				// loop/conditional statement
				this.source.startScope();
			}
			break;
		case "}":
			this.restoreIndex("}");
			this.source.endScope();
			break;
		case "$": {
			if(this.parser.readIf("$")) {
				let input = this.parser.input.substr(this.parser.index);
				if(Polyfill.startsWith.call(input, "context")) {
					this.parser.index += 7;
					this.source.addContext();
					this.parser.last = "t";
					return;
				}
				const functions = ["on", "subscribe", "depend", "rollback", "bind", "unbind", "bindInput"];
				for(let i in functions) {
					let fname = functions[i];
					if(Polyfill.startsWith.call(input, fname + "(")) {
						this.parser.index += fname.length + 1;
						this.source.addSource(`$$${fname}(`);
						this.source.addContext();
						this.source.addSource(", ");
						this.parser.last = ",";
						return;
					}
				}
				this.restoreIndex("$");
			}
			this.restoreIndex("$");
			break;
		}
		case "&": {
			if(this.parser.couldStartRegExp() || this.parser.lastKeywordIn("async", "defer")) {
				let space = this.parser.skipImpl({comments: true});
				let coff = true;
				let tail = this.source.tail();
				let index;
				let previous = () => {
					const length = tail.value.length;
					var beforeSpace = index;
					while(index < length && /\s/.test(tail.value.charAt(length - index - 1))) {
						index++;
					}
					var prevStart = index;
					while(index < length && /[a-zA-Z0-9_$]/.test(tail.value.charAt(length - index - 1))) {
						index++;
					}
					if(prevStart == index) {
						index = beforeSpace;
						return false;
					} else {
						return tail.value.substr(tail.value.length - index, index - prevStart);
					}
				};
				this.parser.parseTemplateLiteral = null;
				if(this.parser.readIf(")")) {
					// wrapped in parentheses
					this.add(space);
					let popped = this.parser.parentheses.pop();
					if(popped) popped.end = this.parser.index;
					this.parser.lastParenthesis = popped;
					this.handleParenthesis(")");
					if(popped) {
						// parentheses do match
						let start = popped.start;
						this.add(this.parser.skipImpl({comments: true}));
						if(this.parser.readIf("=")) {
							// arrow function, start is before the open parenthesis
							this.parser.expect(">");
							this.add("=>");
							index = this.parser.index - start;
						} else if(this.parser.peek() == "{") {
							// a function
							if(this.parser.lastKeywordAt(popped.lastIndex, "function")) {
								index = this.parser.index - popped.lastIndex + 6;
							} else {
								index = this.parser.index - popped.lastIndex - 2;
								previous(); // function name
								previous(); // `function` keyword
							}
						} else {
							// not a computed observable, just an observable with no value
							let index = tail.value.length - (this.parser.index - this.parser.lastParenthesis.end) - 1;
							tail.value = `${tail.value.substring(0, index)}${this.transpiler.feature("cofv")}(${this.source.getContext()})${tail.value.substr(index)}`;
							coff = false;
						}
					}
				} else if(this.parser.peek() == "=") {
					// from arrow function not wrapped
					index = space.length + 2 + this.transpiler.tracker.length;
					this.parser.read(); // =
					this.parser.expect(">");
					this.source.addSource(`${this.transpiler.tracker}${space}=>`);
				}  else {
					// from variable
					let parsed = this.transpiler.parseCode(this.parser.readSingleExpression(true));
					this.add(`${space}${this.transpiler.feature("cofv")}(${this.source.getContext()}, ${parsed.source})`);
					coff = false;
				}
				if(coff) {
					let beforeIndex = index;
					let afterIndex = index;
					let mod, mods = {};
					while(mod = previous()) {
						if(["async", "defer"].indexOf(mod) != -1) {
							mods[mod] = true;
							beforeIndex = index;
						} else {
							break;
						}
					}
					// add expression
					const parsed = this.transpiler.parseCode(this.parser.readExpression(), null, true);
					tail.value = `${tail.value.slice(0, -beforeIndex)}${this.transpiler.feature(mods.defer ? "cofd" : "coff")}(${this.source.getContext()}, ${mods.async ? "async " : ""}${tail.value.substr(-afterIndex)}`;
					this.source.addSource(`${parsed.source})`);
				}
				this.transpiler.updateTemplateLiteralParser();
				this.parser.last = "]"; // see issue#57
				this.parser.lastIndex = this.parser.index - 1;
			} else {
				// bitwise or boolean comparator
				this.restoreIndex("&");
				if(this.parser.readIf("&")) this.restoreIndex("&"); // skip to avoid treating it as possible `and`
			}
			break;
		}
		case "*":
			if(!this.addObservable(true)) {
				// just a multiplication or exponentiation
				this.restoreIndex("*");
				if(this.parser.readIf("*")) {
					// exponentiation, skip to avoid trying to treat it as observable
					this.restoreIndex("*");
				}
			}
			break;
		case "^":
			if(!this.addObservable(false)) {
				// xor operator
				this.restoreIndex("^");
			}
			break;
	}
};

/**
 * @class
 * @since 0.108.0
 */
function AutoSourceCodeMode(transpiler, parser, source, attributes) {
	SourceCodeMode.call(this, transpiler, parser, source, attributes);
}

AutoSourceCodeMode.getOptions = SourceCodeMode.getOptions;

AutoSourceCodeMode.prototype = Object.create(SourceCodeMode.prototype);

/**
 * @class
 * @since 0.15.0
 */
function HTMLMode(transpiler, parser, source, attributes) {
	OptionalLogicMode.call(this, transpiler, parser, source, attributes);
}

HTMLMode.getOptions = function(){
	return {};
};

HTMLMode.prototype = Object.create(OptionalLogicMode.prototype);

HTMLMode.prototype.replaceText = Text.replaceEntities || (function(){
	var converter;
	return function(data){
		if(!converter) converter = document.createElement("textarea");
		converter.innerHTML = data;
		return converter.value;
	};
})();

/**
 * @class
 * @since 0.108.0
 */
function AutoHTMLMode(transpiler, parser, source, attributes, parent) {
	HTMLMode.call(this, transpiler, parser, source, parent && parent.attributes || attributes);
}

AutoHTMLMode.getOptions = HTMLMode.getOptions;

AutoHTMLMode.matchesTag = function(tagName, currentMode){
	return currentMode instanceof AutoSourceCodeMode && tagName != ":debug" && tagName != ":bind";
};

AutoHTMLMode.prototype = Object.create(HTMLMode.prototype);

/**
 * @class
 * @since 0.37.0
 */
function ScriptMode(transpiler, parser, source, attributes) {
	TextExprMode.call(this, transpiler, parser, source, attributes);
	this.scope = !!attributes.scoped && transpiler.nextId();
	if(this.scope) {
		this.pushText("!function(){");
	}
}

ScriptMode.getOptions = function(){
	return {children: false};
};

ScriptMode.matchesTag = function(tagName){
	return tagName.toLowerCase() == "script";
};

ScriptMode.prototype = Object.create(TextExprMode.prototype);

ScriptMode.prototype.usedAttributes = function(){
	if(this.scope) {
		return [{
			type: "~",
			name: "class",
			value: `"script${this.scope}"`
		}];
	} else {
		return [];
	}
};

ScriptMode.prototype.endChain = function(){
	if(this.scope) {
		this.pushText(`}.call(document.querySelector(".script${this.scope}").parentNode)`);
	}
	TextExprMode.prototype.endChain.call(this);
};

ScriptMode.prototype.addCurrent = function(){
	// make sure there are no observables to bind to
	this.current.forEach(({text, value}) => {
		if(!text) {
			value.observables = value.maybeObservables = [];
		}
	});
	TextExprMode.prototype.addCurrent.call(this);
};

ScriptMode.prototype.handle = function(){
	return !!/^\/script>/.exec(this.parser.input.substr(this.parser.index));
};

ScriptMode.prototype.parse = function(handle, eof){
	var result = this.parser.find(["<", "$", "%", "@"], false, true);
	this.pushText(result.pre);
	this.parseImpl(result.pre, result.match, handle, eof);
};

/**
 * @class
 * @since 0.15.0
 */
function CSSMode(transpiler, parser, source, attributes) {
	OptionalLogicMode.call(this, transpiler, parser, source, attributes);
}

CSSMode.getOptions = function(){
	return {comments: true, inlineComments: false, strings: true, children: false};
};

CSSMode.prototype = Object.create(OptionalLogicMode.prototype);

/**
 * @class
 * @since 0.99.0
 */
function SSBMode(transpiler, parser, source, attributes) {
	LogicMode.call(this, transpiler, parser, source, attributes);
	this.observables = false;
	this.expr = [];
	this.scopes = [transpiler.value];
	this.scope = attributes.scope && JSON.stringify(attributes.scope);
	this.scoped = !!attributes.scoped;
	this.inExpr = false;
}

SSBMode.getOptions = function(){
	return {children: false};
};

SSBMode.matchesTag = function(tagName){
	return tagName.toLowerCase() == "style";
};

SSBMode.prototype = Object.create(LogicMode.prototype);

SSBMode.prototype.addScope = function(selector){
	var scope = this.transpiler.nextVarName();
	this.add(`${this.es6 ? "const" : "var"} ${scope}=${this.scopes[this.scopes.length - 1]}.select(${selector});`);
	this.scopes.push(scope);
};

SSBMode.prototype.removeScope = function(){
	this.scopes.pop();
};

SSBMode.prototype.skip = function(){
	var skipped = this.parser.skip();
	if(skipped) this.add(skipped);
};

SSBMode.prototype.start = function(){
	this.source.addSource(`${this.transpiler.feature("cabs")}(${this.source.getContext()}, ${this.scope || +this.scoped}, `);
	this.startRef = this.source.addIsolatedSource("");
};

SSBMode.prototype.find = function(){
	return this.parser.find(["$", "%", "@", "<", "v", "c", "l", "i", "f", "{", "}", "/", "\"", "'", ";"], false, false);
};

SSBMode.prototype.lastValue = function(callback, parser){
	let end = "";
	while(this.current.length) {
		const curr = this.current[0];
		if(curr.comment) {
			// just add the comment to the source code
			this.add(curr.value);
			this.current.shift();
		} else if(curr.text) {
			// add data trimmed before text
			const trimmed = Polyfill.trimStart.call(curr.value);
			this.add(curr.value.substring(0, curr.value.length - trimmed.length));
			if(trimmed.length == 0) {
				// it was whitespace
				this.current.shift();
			} else {
				curr.value = trimmed;
				break;
			}
		} else {
			break;
		}
	}
	while(this.current.length) {
		const curr = this.current[this.current.length - 1];
		if(curr.comment) {
			end = curr.value + end;
			this.current.pop();
		} else if(curr.text) {
			// trim end
			const trimmed = Polyfill.trimEnd.call(curr.value);
			end = curr.value.substr(trimmed.length) + end;
			if(trimmed.length == 0) {
				this.current.pop();
			} else {
				curr.value = trimmed;
				break;
			}
		} else {
			break;
		}
	}
	// create filtered array and add observables to mode's dependencies
	let filtered = this.current.filter(part => {
		if(part.text || part.comment) {
			return part.value.length;
		} else {
			this.observables |= part.value.observables;
			return true;
		}
	});
	if(!filtered.length) {
		filtered.push({text: true, value: ""});
	}
	if(this.es6) {
		callback("`" + filtered.map(part => {
			if(part.text) {
				return part.value.replace(/(`|\$|\\)/gm, "\\$1");
			} else if(part.comment) {
				return `\${""${part.value}}`;
			} else {
				return `\${${parser ? parser(part.value.source) : part.value.source}}`;
			}
		}).join("") + "`");
	} else {
		if(!filtered[0].text) {
			filtered.unshift({text: true, value: ""});
		}
		callback(filtered.map(part => {
			if(part.text) {
				return stringify(part.value);
			} else if(part.comment) {
				return part.value;
			} else {
				return (parser ? parser(part.value.source) : `(${part.value.source})`);
			}
		}).join(" + "));
	}
	if(end) this.add(end);
	this.current = [];
};

SSBMode.prototype.parseImpl = function(pre, match, handle, eof){
	switch(match) {
		case "<":
			if(!/\s/.test(this.parser.peek())) {
				TextExprMode.prototype.parseImpl.call(this, pre, match, handle, eof);
				break;
			}
		case "{":
			this.lastValue(value => this.addScope(value));
			this.statements.push({
				selector: true,
				observables: false,
				end: "",
				parts: [{}],
				single: match == "<"
			});
			this.inExpr = false;
			break;
		case "/":
			if(this.parser.readIf("/")) {
				// only valid on start of the line
				const last = this.current[this.current.length - 1];
				if(!last || last.comment || last.text && /(^|\n)[ \t]*$/.test(last.value)) {
					this.current.push({comment: true, value: "//" + this.parser.findSequence("\n", false)});
				} else {
					this.pushText("//");
				}
			} else if(this.parser.readIf("*")) {
				this.current.push({comment: true, value: `/*${this.parser.findSequence("*/", true)}`});
			} else {
				this.pushText("/");
			}
			break;
		case "\"":
		case "'":
			// skip string
			this.parser.index--;
			this.pushText(this.parser.skipString());
			break;
		case ";": {
			let scope = this.scopes[this.scopes.length - 1];
			let filtered = this.current.filter(c => !c.comment && (!c.text || c.value.trim().length));
			if(filtered.length == 1 && !filtered[0].text && Polyfill.startsWith.call(filtered[0].value.source, "...")) {
				//TODO space/comments before are ignored
				this.add(`${scope}.spread(${filtered[0].value.source.substr(3)});`);
				let curr;
				while((curr = this.current.pop()).text || curr.comment) {
					this.add(curr.value);
				}
				this.current = [];
			} else {
				let value, first = true;
				for(let i=0; i<this.current.length; i++) {
					let current = this.current[i];
					if(current.text) {
						if(!first && current.value.charAt(0) == "@") {
							// must be a stat, do not bother to search for a value
							break;
						}
						let column = current.value.indexOf(":");
						if(column != -1) {
							value = this.current.slice(i + 1);
							value.unshift({text: true, value: current.value.substr(column + 1)});
							current.value = current.value.substring(0, column);
							// add key
							this.current = this.current.slice(0, i + 1);
							this.lastValue(value => this.add(`${scope}.value(${value}`));
							this.add(",");
							// add value
							this.current = value;
							this.lastValue(
								value => this.add(value + ");"),
								value => SSBMode.reparseExpr(value, this.transpiler)
							);
							break;
						}
					}
					if(!current.comment) {
						first = false;
					}
				}
				if(!value) {
					this.lastValue(value => this.add(`${scope}.stat(${value});`));
				}
			}
			let statement = this.statements[this.statements.length - 1];
			if(statement && statement.single) {
				// inlined with `<`, close statement
				this.onStatementEnd(this.statements.pop());
			}
			this.inExpr = false;
			break;
		}
		default:
			TextExprMode.prototype.parseImpl.call(this, pre, match, handle, eof);
	}
};

SSBMode.prototype.parse = function(handle, eof){
	if(!this.inExpr) {
		this.pushText(this.parser.skip());
		this.inExpr = true;
	}
	LogicMode.prototype.parse.call(this, handle, eof);
};

SSBMode.prototype.onStatementStart = function(/*statement*/){
	this.inExpr = false;
};

SSBMode.prototype.onStatementEnd = function(statement){
	if(statement.selector) {
		this.removeScope();
		if(statement.endRef) {
			// remove closing brace
			statement.endRef.value = "";
		}
	} else {
		this.observables |= statement.observables;
	}
	this.inExpr = false;
};

SSBMode.prototype.addFinalCurrent = function(){
	// add remaining spaces at end
	while(this.current.length) {
		this.add(this.current.shift().value);
	}
};

SSBMode.prototype.addCurrent = function(){
	this.current.forEach(curr => {
		if(curr.comment) {
			this.add(curr.value);
		} else if(curr.text) {
			// assert whitespace
			if(!/^\s*$/.test(curr.value)) this.parser.error(`Statement \`${curr.value}\` not closed.`);
			this.add(curr.value);
		} else {
			this.parser.error("Statement `${" + curr.value.source + "}` not closed.");
		}
	});
	this.current = [];
};

SSBMode.prototype.end = function(){
	// replace unneeded closing braces and add statement.end needed for foreach
	this.popped.forEach(popped => {
		if(popped.selector) {
			this.source[popped.endIndex - 1] = "";
		} else if(popped.end.length) {
			this.source[popped.endIndex] = popped.end + this.source[popped.endIndex];
		}
	});
	// wrap content
	this.add(`}${this.es6 ? "" : ".bind(this)"})`);
	let args = [this.transpiler.value];
	if(this.attributes.dollar != false) args.push("$");
	if(this.observables) {
		this.startRef.value = `${this.transpiler.feature("coff")}(${this.source.getContext()}, `;
		if(this.es6) {
			this.startRef.value += `${this.transpiler.tracker} => `;
			this.add(")");
		} else {
			this.startRef.value += `function(${this.transpiler.tracker}){return `;
			this.add("}.bind(this))");
		}
	}
	this.startRef.value += `${this.es6 ? `(${args.join(", ")}) => ` : `function(${args.join(", ")})`}{`;
};

SSBMode.prototype.chainAfter = function(){
	if(this.scoped) return [this.transpiler.feature("scope")];
};

SSBMode.reparseExprImpl = function(expr, info, transpiler){
	var parser = new Parser(expr);
	Polyfill.assign(parser.options, {comments: true, strings: true});
	function skip() {
		var skipped = parser.skipImpl({comments: true, strings: false});
		if(skipped) info.computed += skipped;
	}
	function readSign() {
		var result = parser.readImpl(/^[+-]{1,2}/, false);
		if(result) {
			info.computed += result;
			info.op++;
		}
	}
	function readOp() {
		var result = parser.readImpl(/^[+*/%-]/, false);
		if(result) {
			info.computed += result;
			info.op++;
			return true;
		}
	}
	while(!parser.eof()) {
		skip();
		readSign();
		if(parser.peek() == "(") {
			info.computed += "(";
			if(!SSBMode.reparseExprImpl(parser.skipEnclosedContent().slice(1, -1), info, transpiler)) return false;
			info.computed += ")";
		} else {
			var v = parser.readSingleExpression(true);
			if(/^[a-zA-Z_$]/.exec(v)) {
				// it's a variable
				info.is = true;
				info.computed += `${transpiler.value}(${v})`;
			} else {
				info.computed += v;
			}
		}
		readSign();
		skip();
		var op = readOp();
		skip();
		if(!op && !parser.eof()) return false;
	}
	return true;
};

SSBMode.reparseExpr = function(expr, transpiler){
	var info = {
		runtime: transpiler.runtime,
		computed: `${transpiler.feature("cu")}(${transpiler.options.es6 ? `${transpiler.value} =>` : `function(${transpiler.value}){return`} `,
		is: false,
		op: 0
	};
	return SSBMode.reparseExprImpl(expr, info, transpiler) && info.is && info.op && `${info.computed}${transpiler.options.es6 ? "" : "}.bind(this)"})` || (transpiler.options.es6 ? expr : `(${expr})`);
};

/**
 * @class
 * @since 0.124.0
 */
function HTMLCommentMode(transpiler, parser, source, attributes) {
	TextExprMode.call(this, transpiler, parser, source, attributes);
	this.values = [];
}

HTMLCommentMode.getOptions = function(){
	return {children: false};
};

HTMLCommentMode.prototype = Object.create(TextExprMode.prototype);

HTMLCommentMode.prototype.add = function(text){
	if(text.length) this.values.push(stringify(text));
};

HTMLCommentMode.prototype.addText = function(expr){
	this.values.push(expr);
};

HTMLCommentMode.prototype.parse = function(handle, eof){
	var result = this.parser.find(["$"], false, true);
	this.pushText(result.pre);
	this.parseImpl(result.pre, result.match, handle, eof);
};

// register default modes

defineMode(["code", "javascript", "js"], SourceCodeMode, true);
defineMode(["html"], HTMLMode);
defineMode(["script"], ScriptMode);
defineMode(["css"], CSSMode);
defineMode(["ssb", "style"], SSBMode);
defineMode(["__comment"], HTMLCommentMode); // anonymous define

// register auto modes after default modes to give less precedence to `matchesTag`

defineMode(["auto-code"], AutoSourceCodeMode);
defineMode(["auto-html"], AutoHTMLMode);

module.exports = { modeRegistry, modeNames, defaultMode, startMode };
