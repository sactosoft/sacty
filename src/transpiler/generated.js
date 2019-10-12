/**
 * @class
 * @since 0.132.0
 */
function Generated(transpiler) {
	this.transpiler = transpiler;
	this.scope = {context: 0, children: []};
	this.fun;
	this.data = [];
	this.uses = {};
}

/**
 * @since 0.132.0
 */
Generated.prototype.fork = function(){
	var ret = new Generated(this.transpiler);
	ret.scope.context = this.scope.context;
	return ret;
};

/**
 * Gets the last element in the array of generated source.
 * @since 0.132.0
 */
Generated.prototype.tail = function(){
	return this.data[this.data.length - 1];
};

/**
 * Adds data to the source.
 * @returns The added data.
 * @since 0.132.0
 */
Generated.prototype.add = function(type, value, isolate){
	var data;
	if(!isolate && this.data.length && !(data = this.data[this.data.length - 1]).type) {
		data.value += value;
	} else {
		data = {type: isolate ? "isolated" : "", value};
		this.data.push(data);
	}
	return data;
};

/**
 * Adds raw source code to the source.
 * @returns The added object reference, which value field can later be modified without altering the array.
 * @since 0.132.0
 */
Generated.prototype.addSource = Generated.prototype.push = function(value, isolate){
	return this.add(0, value, isolate);
};

/**
 * @since 0.132.0
 */
Generated.prototype.addIsolatedSource = function(value){
	return this.addSource(value, true);
};

/**
 * @since 0.132.0
 */
Generated.prototype.injectFunctionContext = function(scope){
	if(!scope.injected) {
		scope.injected = true;
		// calculate number of arguments
		var skip, count = 0;
		var args = scope.args.split(",");
		if(args.length) {
			args = args.map(arg => arg.trim());
			if(!args[args.length - 1].length) args.pop();
			args.forEach(arg => {
				if(skip) {
					if(arg.charAt(arg.length - 1) == skip) {
						skip = false;
						count++;
					}
				} else if(arg.charAt(0) == "{") {
					skip = "}";
				} else if(arg.charAt(0) == "[") {
					skip = "]";
				} else {
					count++;
				}
			});
		}
		const context = type => this.transpiler["context" + type];
		scope.data.value = `var ${context(scope.context)}=${this.transpiler.runtime}.cfa(${context(scope.prevContext)}, arguments, ${count});`;
	}
};

/**
 * @since 0.132.0
 */
Generated.prototype.addContext = function(){
	this.addSource(this.getContext());
};

/**
 * @since 0.139.0
 */
Generated.prototype.getContext = function(){
	this.uses.context = true;
	if(this.fun) {
		var context = "context" + this.fun.context;
		// check whether the current function is already injected
		var scope = this.fun;
		do {
			if(scope.fun) {
				this.injectFunctionContext(scope);
			}
		} while(scope = scope.parent);
		// add actual variable to source
		return this.transpiler[context];
	} else {
		return this.transpiler.context0;
	}
};

/**
 * @since 0.132.0
 */
Generated.prototype.startScope = function(after){
	var scope = {
		parent: this.scope,
		context: this.scope.context,
		prevContext: this.scope.prevContext,
		children: [],
		after
	};
	this.scope.children.push(scope);
	this.scope = scope;
};

/**
 * @since 0.132.0
 */
Generated.prototype.startFunction = function(args){
	var scope = {
		parent: this.scope,
		prevContext: this.scope.context,
		context: (this.scope.context + 1) % 2,
		children: [],
		data: this.addIsolatedSource(""),
		fun: true,
		args
	};
	this.scope.children.push(scope);
	this.scope = this.fun = scope;
};

/**
 * @since 0.132.0
 */
Generated.prototype.endScope = function(){
	if(this.scope.fun) {
		// search for closest parent function
		var parent = this.scope.parent;
		while(parent && !parent.fun) {
			parent = parent.parent;
		}
		this.fun = parent;
	}
	if(this.scope.after) this.addSource(this.scope.after);
	this.scope = this.scope.parent;
};

/**
 * @since 0.132.0
 */
Generated.prototype.toString = function(){
	return this.data.map(a => a.value).join("");
};

module.exports = Generated;
