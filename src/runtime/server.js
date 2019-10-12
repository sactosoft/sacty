// init global variables
require("../dom");

var Attr = require("../attr");
var Builder = require("./core");
var counter = require("./counter");
var Sactory = require("./widgets");

Builder.prototype.event = function(name, value){
	this.element.ownerDocument.addEventListener(this.element, name, value);
};

Object.defineProperty(Node.prototype, "~builder", {
	configurable: true,
	get() {
		var value = new Builder(this);
		Object.defineProperty(this, "~builder", {value});
		return value;
	}
});

/**
 * @since 0.134.0
 */
function document(arg0, arg1, context) {
	const ret = context.document = new HTMLDocument();
	ret.render = function(){
		this.documentElement.dataset.sactory = counter.nextId();
		return HTMLDocument.prototype.render.apply(this, arguments);
	};
	return ret;
}

/**
 * @since 0.142.0
 */
function app({name = "App", src, runtime = "Sactory", args}, arg1, context) {
	const id = counter.nextPrefix();
	const script1 = context.document.createElement("script");
	script1.setAttribute("src", src);
	const script2 = context.document.createElement("script");
	const data = [];
	for(let key in args) {
		data.push(`[${Attr.WIDGET}, "${key}", ${JSON.stringify(args[key])}]`);
	}
	script2.textContent = `window.addEventListener("load",function(){var e=document.querySelector("#${id}");${runtime}.chain({element: e.parentNode, anchor: e.nextSibling}, [${runtime}.chain.create, ${name}, 0, [${data.join(", ")}]], [${runtime}.chain.append])})`;
	script2.setAttribute("id", id);
	context.document.head.appendChild(script1);
	return script2;
}

Object.defineProperty(Sactory.widgets, "document", {value: document});
Object.defineProperty(Sactory.widgets, "app", {value: app});

module.exports = Sactory;
