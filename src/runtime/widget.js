var { hyphenate, dehyphenate } = require("../util");
var SactoryConst = require("./const");
var SactoryContext = require("./context");
var counter = require("./counter");

var Sactory = {};

var widgets = {};

function addWidgetImpl(name, widget, callback) {
	if(widget) {
		callback(name, widget);	
	} else if(name && name.name) {
		callback(hyphenate(name.name), name);
	} else {
		throw new Error("Invalid or missing name widget.");
	}
}

/**
 * Defines a widget.
 * @param {string} name - The case-sensitive name of the widget.
 * @param {class} widget - The widget function or class.
 * @throws {Error} When a widget with the same name already exists.
 * @since 0.73.0
 */
Sactory.addWidget = function(name, widget, replaceable = true){
	addWidgetImpl(name, widget, (name, widget) => {
		if(Object.prototype.hasOwnProperty.call(widgets, name)) {
			throw new Error(`Widget "${name}" already registered. Either specify a different name or use "replaceWidget" instead.`);
		} else if(replaceable) {
			widgets[name] = widget;
		} else {
			Object.defineProperty(widgets, name, {value: widget});
		}
	});
};

/**
 * Defines or replaces a widget.
 * @param {string} name - The case-sensitive name of the widget.
 * @param {class} widget - The widget function or class.
 * @since 0.134.0
 */
Sactory.replaceWidget = function(name, widget){
	addWidgetImpl(name, widget, (name, widget) => {
		var descriptor = Object.getOwnPropertyDescriptor(widgets, name);
		if(descriptor && !descriptor.configurable) {
			throw new Error(`Widget "${name}" cannot be replaced.`);
		} else {
			widgets[name] = widget;
		}
	});
};

/**
 * Removes a widget by its name.
 * @since 0.73.0
 */
Sactory.removeWidget = function(name){
	if(typeof name != "string") name = hyphenate(name.name);
	delete widgets[name];
};

/**
 * Indicates whether a widget with the given name exists.
 * @since 0.89.0
 */
Sactory.hasWidget = function(name){
	return Object.prototype.hasOwnProperty.call(widgets, name);
};

/**
 * Gets the instance of the widget with the given name.
 * @since 0.112.0
 */
Sactory.getWidget = function(name, registry, ref = {}){
	const sep = name.indexOf("$");
	if(sep === -1) {
		return Object.prototype.hasOwnProperty.call(widgets, name) && widgets[name];
	} else if(registry) {
		const fname = name.substr(sep + 1);
		const dname = dehyphenate(name);
		if(sep === 0) {
			// search in main widgets' children
			do {
				if(registry.widgets.main) {
					const p = registry.widgets.main;
					const ret = p["render$" + fname] || p["render$" + dname];
					if(ret) {
						ref.parentWidget = p;
						return ret;
					}
				}
			} while(registry = registry.parent);
		} else {
			// search in named widgets's children only
			ref.parentName = name.substring(0, sep);
			do {
				if(Object.prototype.hasOwnProperty.call(registry.widgets.named, ref.parentName)) {
					const p = ref.parentWidget = registry.widgets.named[ref.parentName];
					return p["render$" + fname] || p["render$" + dname];
				}
			} while(registry = registry.parent);
		}
	}
};

/**
 * @since 0.139.0
 */
Sactory.getFunctionWidget = function(name, registry, ref){
	if(typeof name == "function") {
		return name;
	} else {
		return Sactory.getWidget(name, registry, ref);
	}
};

/**
 * Gets a list with the names of every registered widget.
 * @since 0.73.0
 */
Sactory.getWidgetsNames = function(){
	return Object.keys(widgets);
};

/**
 * Gets the widget with the given name associated to the
 * given element.
 * If no name is given the main widget is returned.
 * @since 0.112.0
 */
Sactory.widget = function(element, name){
	return element["~builder"] && (name ? element["~builder"].widgets[name] : element["~builder"].widget) || null;
};

/**
 * Gets the widget with the given name associated to the
 * element queries with the given selector.
 * If no name is given the main widget is returned.
 * @since 0.115.0
 */
Sactory.widgetSelector = function(selector, name){
	var element = document.querySelector(selector);
	return element && Sactory.widget(element, name);
};

/**
 * @class
 * @since 0.73.0
 */
function Widget(attrs) {
	this.attrs = attrs;
}

Widget.prototype.element = null;

/**
 * @since 0.73.0
 */
Widget.prototype.render = function(){
	var error = document.createElement("p");
	error.style.color = "red";
	error.style.fontFamily = "monospace";
	error.innerHTML = "The widget's <b>render</b> function is not implemented.";
	return error;
};

/**
 * @since 0.94.0
 */
Widget.prototype.dispatchEvent = function(event, options = {}){
	if(!this.element) throw new Error("Cannot dispatch event: the widget has not been rendered yet.");
	this.element["~builder"].dispatchEvent(event, options);
};

/**
 * @since 0.129.0
 */
Widget.newInstance = function(Class, context, args){
	return new Class(args, args, context);
};

/**
 * @since 0.125.0
 */
Widget.render = function(Class, instance, context, args){
	var element = instance.__element = instance.render(args, args, context);
	if(instance instanceof Widget) instance.element = element;
	if(!(element instanceof Node)) throw new Error("The widget's render function did not return an instance of 'Node', returned '" + element + "' instead.");
	if(Class.style) Widget.createStyle({document: context.document}, Class, element);
	if(Class.prototype.style) Widget.createStyle(context, instance, element);
	return element;
};

/*
 * @since 0.125.0
 */
Widget.createStyle = function(context, styler, element){
	var className = styler.__styled;
	if(!className) {
		styler.__styled = className = counter.nextPrefix();
		styler.style(SactoryContext.newContext(context, {selector: "." + className, element: context.document.head}));
	}
	element["~builder"].addClass(className);
};

/**
 * @since 0.129.0
 */
Widget.newInstanceRender = function(Class, context, args){
	var instance = Widget.newInstance(Class, context, args);
	return {instance, element: Widget.render(Class, instance, context, args)};
};

Sactory.Widget = Widget;

/**
 * @class
 * @param {Registry} parent
 * @since 0.128.0
 */
function Registry(parent) {
	this.parent = parent;
	this.widgets = {
		main: null,
		named: {}
	};
	this.slots = {};
	if(parent) this.targetSlots = parent.targetSlots;
	this.main = null;
}

Registry.prototype.addNamed = function(widget, ...names){
	names.forEach(name => {
		if(typeof name === "string") {
			// every possible name (usually tag name and given name) is always registered
			this.widgets.named[name] = widget;
		}
	});
	if(typeof widget.name === "string" && !Object.prototype.hasOwnProperty.call(this.widgets.named, widget.name)) {
		// the widget's own name is only registered if it does not cause any conflict
		this.widgets.named[widget.name] = widget;
	}
};

Registry.prototype.sub = function(name, main){
	var ret = new Registry(this.parent);
	ret.widgets = this.widgets;
	ret.slots = this.slots;
	ret.targetSlots = this.slots[name] = {};
	if(main) this.main = name;
	return ret;
};

Registry.prototype.add = function(anchor, name, element){
	this.targetSlots[name || SactoryConst.SL_CONTENT] = {anchor, element};
};

module.exports = { Sactory, Widget, Registry };
