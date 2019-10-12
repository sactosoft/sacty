var Sactory = {}; // just to make the linter happy

function defineBuilder(Class) {
	Object.defineProperty(Class.prototype, "~builder", {
		configurable: true,
		get() {
			return this["~builderInstance"] || (this["~builderInstance"] = new Sactory(this));
			/*var value = new Sactory(this);
			Object.defineProperty(this, "~builder", {value});
			return value;*/
		}
	});
}

defineBuilder(Window);
defineBuilder(Document);
defineBuilder(Element);
defineBuilder(DocumentFragment);
if(typeof ShadowRoot == "function") defineBuilder(ShadowRoot);

Window.prototype.$$on = Document.prototype.$$on = Element.prototype.$$on = function(context, name, value){
	Sactory.$$on(context, this, name, value);
};
