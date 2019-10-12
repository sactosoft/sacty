var Attr = require("../attr");
var { hyphenate } = require("../util");

var SactoryBind = require("./bind");
var SactoryConfig = require("./config");
var SactoryObservable = require("./observable");

var counter = require("./counter");

/**
 * @class
 */
function Sactory(element) {
	this.element = element;
	this.hasComplexStyle = false;
	this.styles = [];
	this.events = {};
	if(!this.element.classList) {
		// element does not have `classList`, bind to a polyfill
		this.addClassName = this.addClassNamePolyfill.bind(this);
		this.removeClassName = this.removeClassNamePolyfill.bind(this);
	}
}

Sactory.prototype.widgets = {};

Sactory.prototype.widget = null;

/**
 * @since 0.129.0
 */
Sactory.prototype.observe = function(bind, observable, fun, type){
	const ret = observable.subscribe({bind}, fun, type);
	fun(observable.value);
	return ret;
};
	
Sactory.prototype.attr = function(name, value, bind){
	if(SactoryObservable.isObservable(value)) {
		this.observe(bind, value, value => this.element.setAttribute(name, value));
	} else {
		this.element.setAttribute(name, value);
	}
};
	
Sactory.prototype.prop = function(name, value, bind, type){
	if(SactoryObservable.isObservable(value)) {
		this.observe(bind, value, value => this.element[name] = value, type);
	} else {
		this.element[name] = value;
	}
};

/**
 * @since 0.79.0
 */
Sactory.prototype.complexStyle = function(name, value, bind){
	if(this.element.style.length) {
		// transfer inline styles
		var values = Array.prototype.map.call(this.element.style, name => ({name, value: this.element.style[name]}));
		if(values.length) this.styleImpl(values, bind);
		// remove inline styles
		this.element.removeAttribute("style");
		// transfer inline styles that are observables
		this.styles.forEach(({name, value, subscription, bind}) => {
			subscription.dispose();
			this.styleImpl([{name, value}], bind);
		});
	}
	this.hasComplexStyle = true;
	var node = document.createElement("style");
	/* debug:
	node.setAttribute(":usage", "inline-pseudo-class");
	node.setAttribute(":for", this.runtimeId);
	*/
	var className = counter.nextPrefix();
	var wrap;
	var dot = name.indexOf(".");
	if(dot == -1) {
		wrap = value => `.${className}${name}{${value}}`;
	} else {
		var prop = hyphenate(name.substr(dot + 1));
		name = name.substring(0, dot);
		if(prop.charAt(0) == "!") {
			prop = prop.substr(1);
			wrap = value => `.${className}${name}{${prop}:${value} !important;}`;
		} else {
			wrap = value => `.${className}${name}{${prop}:${value};}`;
		}
	}
	if(SactoryObservable.isObservable(value)) {
		this.observe(bind, value, value => node.textContent = wrap(value));
	} else {
		node.textContent = wrap(value);
	}
	this.className(className);
	document.head.appendChild(node);
};

/**
 * @since 0.121.0
 */
Sactory.prototype.style = function(name, value, bind){
	if(this.hasComplexStyle) {
		if(value === false) {
			this.styleImpl([{name, value: "0"}, {name, value: "none"}], bind);
		} else {
			this.styleImpl([{name, value}], bind);
		}
	} else {
		var prop = name;
		var get = value => value;
		var update = value => this.element.style[prop] = get(value);
		if(name.charAt(0) == "!") {
			prop = name.substr(1);
			get = value => `${value} !important`;
		}
		if(SactoryObservable.isObservable(value)) {
			const subscription = this.observe(bind, value, update);
			this.styles.push({name, value, subscription, bind});
		} else if(value === false) {
			update("0");
			update("none");
		} else {
			update(value);
		}
	}
};

/**
 * @since 0.121.0
 */
Sactory.prototype.styleImpl = function(values){
	// hyphenate and convert to string
	values.forEach(a => {
		var name = hyphenate(a.name);
		if(name.charAt(0) == "!") {
			name = name.substr(1);
			a.toString = () => `${name}:${a.value} !important;`;
		} else {
			a.toString = () => `${name}:${a.value};`;
		}
	});
	var node = document.createElement("style");
	/* debug:
	node.setAttribute(":usage", "inline-styles");
	node.setAttribute(":for", this.runtimeId);
	*/
	var className = counter.nextPrefix();
	var update = () => node.textContent = `.${className}{${values.join("")}}`;
	values.forEach(({value, bind}) => {
		if(SactoryObservable.isObservable(value)) {
			value.subscribe({bind}, update);
		}
	});
	update();
	this.className(className);
	document.head.appendChild(node);
};
	
Sactory.prototype.text = function(value, {top, bind, anchor, document}){
	let textNode;
	if(SactoryObservable.isObservable(value)) {
		textNode = document.createTextNode("");
		this.observe(bind, value, value => {
			textNode.textContent = value + "";
			textNode.observed = true;
		});
	} else {
		textNode = document.createTextNode(value);
	}
	if(anchor && anchor.parentNode === this.element) {
		this.element.insertBefore(textNode, anchor);
	} else {
		this.element.appendChild(textNode);
	}
	if(top) {
		bind.appendChild(textNode);
	}
};

/**
 * @since 0.63.0
 */
Sactory.prototype.html = function(value, {top, bind, anchor, document}){
	var children, container = document.createElement("div");
	var parse = (value, anchor) => {
		container.innerHTML = value;
		children = Array.prototype.slice.call(container.childNodes, 0);
		children.forEach(child => {
			if(anchor && anchor.parentNode === this.element) {
				this.element.insertBefore(child, anchor);
			} else {
				this.element.appendChild(child);
			}
			if(top) {
				bind.appendChild(child);
			}
		});
	};
	if(SactoryObservable.isObservable(value)) {
		// create an anchor to maintain the right order
		var innerAnchor = SactoryBind.anchor({element: this.element, bind, anchor});
		value.subscribe({bind}, value => {
			// removing children from bind context should not be necessary,
			// as they can't have any sactory-created context
			children.forEach(child => this.element.removeChild(child));
			parse(value, innerAnchor);
		});
		parse(value.value, innerAnchor);
	} else {
		parse(value, anchor);
	}
};

/**
 * @since 0.100.0
 */
Sactory.prototype.className = function(className, bind){
	if(SactoryObservable.isObservable(className)) {
		let value = className.value;
		className.subscribe({bind}, newValue => {
			this.removeClassName(value);
			this.addClassName(value = newValue);
		});
		this.addClassName(value);
		if(bind && bind.id !== this.bindId) {
			bind.addRollback(() => this.removeClassName(value));
		}
	} else {
		this.addClassName(className);
		if(bind && bind.id !== this.bindId) {
			bind.addRollback(() => this.removeClassName(className));
		}
	}
};

/**
 * @since 0.100.0
 */
Sactory.prototype.classNameIf = function(className, condition, bind){
	if(SactoryObservable.isObservable(condition)) {
		condition.subscribe({bind}, newValue => {
			if(newValue) {
				// add class
				this.addClassName(className);
			} else {
				// remove class name
				this.removeClassName(className);
			}
		});
		if(condition.value) this.addClassName(className);
		if(bind && bind.id !== this.bindId) {
			bind.addRollback(() => condition.value && this.removeClassName(className));
		}
	} else if(condition) {
		this.addClassName(className);
		if(bind && bind.id !== this.bindId) {
			bind.addRollback(() => this.removeClassName(className));
		}
	}
};

/**
 * @since 0.62.0
 */
Sactory.prototype.addClassName = function(className){
	className.split(" ").forEach(className => this.element.classList.add(className));
};

/**
 * @since 0.62.0
 */
Sactory.prototype.removeClassName = function(className){
	className.split(" ").forEach(className => this.element.classList.remove(className));
};

/**
 * @since 0.137.0
 */
Sactory.prototype.addClassNamePolyfill = function(className){
	var classes = this.element.getAttribute("class") || "";
	if(classes.length) classes += " ";
	this.element.setAttribute(classes + className);
};

/**
 * @since 0.137.0
 */
Sactory.prototype.removeClassNamePolyfill = function(className){
	var classes = this.element.getAttribute("class");
	if(classes) {
		classes = classes.split(" ");
		var index = classes.indexOf(className);
		if(index != -1) {
			classes.splice(index, 1);
			this.element.setAttribute("class", classes.join(" "));
		}
	}
};

/**
 * @since 0.22.0
 */
Sactory.prototype.event = function(name, value, bind){
	var split = name.split(":");
	if(name.args) split = split.map(a => a.toValue());
	var event = split.shift();
	var listener = value || function(){};
	var options = {};
	split.reverse().forEach(mod => {
		var prev = listener;
		if(typeof mod == "function") {
			listener = function(event){
				if(mod.call(this, event)) prev.apply(this, arguments);
			};
		} else {
			switch(mod) {
				case "this":
					console.warn("Event modifier \":this\" does no longer work. Either bind the function yourself or use an arrow function to maintain the right scope.");
					break;
				case "noargs":
					listener = function(){
						return prev.call(this);
					};
					break;
				case "prevent":
					listener = function(event){
						event.preventDefault();
						return prev.apply(this, arguments);
					};
					break;
				case "stop":
					listener = function(event){
						event.stopPropagation();
						return prev.apply(this, arguments);
					};
					break;
				case "once":
					options.once = true;
					break;
				case "passive":
					options.passive = true;
					break;
				case "capture":
					options.capture = true;
					break;
				case "bubble":
					options.capture = false;
					break;
				case "trusted":
					listener = function(event){
						if(event.isTrusted) {
							return prev.apply(this, arguments);
						}
					};
					break;
				case "!trusted":
					listener = function(event){
						if(!event.isTrusted) {
							return prev.apply(this, arguments);
						}
					};
					break;
				case "self":
					listener = function(event){
						if(event.target === this) {
							return prev.apply(this, arguments);
						}
					};
					break;
				case "!self":
					listener = function(event){
						if(event.target !== this) {
							return prev.apply(this, arguments);
						}
					};
					break;
				case "alt":
				case "ctrl":
				case "meta":
				case "shift":
					listener = function(event){
						if(event[mod + "Key"]) {
							return prev.apply(this, arguments);
						}
					};
					break;
				case "!alt":
				case "!ctrl":
				case "!meta":
				case "!shift":
					mod = mod.substr(1);
					listener = function(event){
						if(!event[mod + "Key"]) {
							return prev.apply(this, arguments);
						}
					};
					break;
				default:
					var positive = mod.charAt(0) != "!";
					if(!positive) mod = mod.substr(1);
					var dot = mod.split(".");
					var keys, delay, timeout;
					switch(dot[0]) {
						case "key":
							keys = dot.slice(1).map(ret => {
								ret = ret.toLowerCase();
								if(Object.prototype.hasOwnProperty.call(SactoryConfig.config.event.aliases, ret)) {
									ret = SactoryConfig.config.event.aliases[ret];
								}
								var separated = ret.split("-");
								if(separated.length == 2) {
									const [a, b] = separated;
									let parser;
									if(a.length == 1 && b.length == 1) {
										parser = value => value.toUpperCase().charCodeAt(0);
									} else if(a.charAt(0) == "f" && b.charAt(0) == "f") {
										parser = value => 111 + parseInt(value.substr(1));
									}
									if(parser) {
										const from = parser(a);
										const to = parser(b);
										return function(event){
											var code = event.keyCode || event.which;
											return code >= from && code <= to;
										};
									}
								}
								if(ret != "-") {
									ret = ret.replace(/-/g, "");
								}
								return function(event){
									return event.key.toLowerCase() == ret;
								};
							});
							if(positive) {
								listener = function(event){
									for(let i in keys) {
										if(keys[i](event)) {
											return prev.apply(this, arguments);
										}
									}
								};
							} else {
								listener = function(event){
									for(let i in keys) {
										if(keys[i](event)) return;
									}
									return prev.apply(this, arguments);
								};
							}
							break;
						case "code":
							keys = dot.slice(1).map(a => a.toLowerCase().replace(/-/g, ""));
							if(positive) {
								listener = function(event){
									if(keys.indexOf(event.code.toLowerCase()) != -1) {
										return prev.apply(this, arguments);
									}
								};
							} else {
								listener = function(event){
									if(keys.indexOf(event.code.toLowerCase()) == -1) {
										return prev.apply(this, arguments);
									}
								};
							}
							break;
						case "keyCode":
						case "key-code":
							keys = dot.slice(1).map(a => parseInt(a));
							if(positive) {
								listener = function(event){
									if(keys.indexOf(event.keyCode || event.which) != -1) {
										return prev.apply(this, arguments);
									}
								};
							} else {
								listener = function(event){
									if(keys.indexOf(event.keyCode || event.which) == -1) {
										return prev.apply(this, arguments);
									}
								};
							}
							break;
						case "button":
							var buttons = dot.slice(1).map(a => {
								switch(a) {
									case "main":
									case "left":
										return 0;
									case "auxiliary":
									case "wheel":
									case "middle":
										return 1;
									case "secondary":
									case "right":
										return 2;
									case "fourth":
									case "back":
										return 3;
									case "fifth":
									case "forward":
										return 4;
									default:
										return parseInt(a);
								}
							});
							if(positive) {
								listener = function(event){
									if(buttons.indexOf(event.button) != -1) {
										return prev.apply(this, arguments);
									}
								};
							} else {
								listener = function(event){
									if(buttons.indexOf(event.button) == -1) {
										return prev.apply(this, arguments);
									}
								};
							}
							break;
						case "location":
							var locations = dot.slice(1).map(a => {
								switch(a) {
									case "standard": return 0;
									case "left": return 1;
									case "right": return 2;
									case "numpad": return 3;
									default: return parseInt(a);
								}
							});
							if(positive) {
								listener = function(event){
									if(locations.indexOf(event.location) != -1) {
										return prev.apply(this, arguments);
									}
								};
							} else {
								listener = function(event){
									if(locations.indexOf(event.location) == -1) {
										return prev.apply(this, arguments);
									}
								};
							}
							break;
						case "throttle":
							if((delay = parseInt(dot[1])) >= 0) {
								listener = function(){
									if(!timeout) {
										prev.apply(this, arguments);
										timeout = true;
										timeout = setTimeout(() => timeout = false, delay);
									}
								};
							} else {
								throw new Error("Event delay must be higher or equals than 0.");
							}
							break;
						case "debounce":
							if((delay = parseInt(dot[1])) >= 0) {
								listener = function(){
									if(timeout) clearTimeout(timeout);
									timeout = setTimeout(() => {
										timeout = 0;
										prev.apply(this, arguments);
									}, delay);
								};
							} else {
								throw new Error("Event delay must be higher or equals than 0.");
							}
							break;
						default:
							throw new Error("Unknown event modifier '" + mod + "'.");
					}
					break;
			}
		}
	});
	if(event == "documentappend") {
		// special event
		event = "append";
		var append = listener;
		var element = this.element;
		listener = function(event){
			if(contains(element.ownerDocument, element)) {
				append.call(element, event, element);
			} else {
				var parent = event.detail.parentNode;
				while(parent.parentNode) parent = parent.parentNode;
				parent["~builder"].eventImpl("append", listener, options, bind);
			}
		};
	} else if(value) {
		var prev = listener;
		listener = function(event){
			prev.call(this, event, this);
		};
	}
	this.eventImpl(event, listener, options, bind);
};

/**
 * @since 0.91.0
 */
Sactory.prototype.eventImpl = function(event, listener, options, bind){
	this.events[event] = true;
	this.element.addEventListener(event, listener, options);
	if(bind && bind.id !== this.bindId) {
		bind.addRollback(() => {
			this.element.removeEventListener(event, listener, options);
		});
	}
};

if(SactoryConfig.config.ie) {
	var impl = Sactory.prototype.eventImpl;
	Sactory.prototype.eventImpl = function(event, listener, {capture, once}, bind){
		if(once) {
			// polyfill
			var prev = listener;
			listener = function(){
				prev.apply(this, arguments);
				this.removeEventListener(event, listener, capture);
			};
		}
		impl.call(this, event, listener, capture, bind);
	};
}

/**
 * @since 0.69.0
 */
Sactory.prototype[Attr.NONE] = function({bind}, name, value){
	this.attr(name.toString(), value, bind);
};

/**
 * @since 0.63.0
 */
Sactory.prototype[Attr.PROP] = function({bind}, name, value){
	this.prop(name.toString(), value, bind);
};

/**
 * @since 0.121.0
 */
Sactory.prototype[Attr.STYLE] = function({bind}, name, value){
	name = name.toString();
	if(/[!a-z-]/.test(name.charAt(0))) {
		this.style(name, value, bind);
	} else {
		this.complexStyle(name, value, bind);
	}
};

/**
 * @since 0.69.0
 */
Sactory.prototype[Attr.EVENT] = function({bind}, name, value){
	this.event(name, value, bind);
};

// polyfill

if(Object.getOwnPropertyDescriptor(Element.prototype, "classList")) {

	Sactory.prototype.addClass = function(className){
		this.element.classList.add(className);
	};

	Sactory.prototype.removeClass = function(className){
		this.element.classList.remove(className);
	};

} else {

	Sactory.prototype.addClass= function(className){
		if(!this.element.className.split(" ").indexOf(className) != -1) {
			this.element.className = (this.element.className + " " + className).trim();
		}
	};

	Sactory.prototype.removeClass = function(className){
		this.element.className = this.element.className.split(" ").filter(function(a){
			return a != className;
		}).join(" ");
	};

}

if(typeof CustomEvent == "function") {

	Sactory.prototype.dispatchEvent = function(name, {bubbles, cancelable, detail}){
		var event = new CustomEvent(name, {bubbles, cancelable, detail});
		this.element.dispatchEvent(event);
		return event;
	};

} else {

	Sactory.prototype.dispatchEvent = function(name, {bubbles, cancelable, detail}){
		var event = document.createEvent("Event");
		event.initEvent(name, bubbles, cancelable);
		event.detail = detail;
		this.element.dispatchEvent(event);
		return event;
	};

}

function contains(owner, element) {
	if(element.parentNode) {
		if(element.parentNode === owner) return true;
		else return contains(owner, element.parentNode);
	} else {
		return false;
	}
}

module.exports = Sactory;
