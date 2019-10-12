var Polyfill = require("../polyfill");
var Transpiler = require("./transpiler");

/**
 * @since 0.125.0
 */
Transpiler.eval = function(source){
	return eval.call(window, new Transpiler({versionCheck: false, mode: "auto-code"}).transpile(source).source.all);
};

var count = 0;
var es6 = false;
try {
	eval("es6 = class {}, true");
// eslint-disable-next-line no-empty
} catch(e) {}

function evalScripts() {
	Array.prototype.forEach.call(document.querySelectorAll("script[type='text/sactory'], script[type='text/x-sactory']"), element => {
		var id = count++ + "";
		element.setAttribute("data-sactory-from", id);
		element.setAttribute("data-to", `[data-sactory-to='${id}']`);
		var script = document.createElement("script");
		script.setAttribute("data-sactory-to", id);
		script.setAttribute("data-from", `[data-sactory-from='${id}']`);
		var attributes = {};
		Array.prototype.forEach.call(element.attributes, attr => {
			if(Polyfill.startsWith.call(attr.name, "mode:")) {
				attributes[attr.name.substr(5)] = true;
			}
		});
		var transpiler = new Transpiler({
			namespace: id,
			mode: element.getAttribute("mode"),
			modeAttributes: attributes,
			es6,
			before: `var $$script=document.querySelector("[data-sactory-from='${id}']");`,
			element: "$$script&&$$script.parentNode",
			anchor: "$$script&&$$script.nextSibling"
		});
		script.textContent = transpiler.transpile(element.textContent).source.all;
		document.head.appendChild(script);
	});
}

if(document.readyState == "complete") {
	evalScripts();
} else {
	window.addEventListener("load", evalScripts);
}
