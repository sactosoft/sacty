var SactoryConfig = require("./config");

/**
 * @class
 * @since 0.122.0
 */
function Counter(count){
	this.init = this.count = count;
	this.bind = 0;
	this.observable = 0;
	this.subscription = 0;
}

/**
 * @since 0.132.0
 */
Counter.prototype.reset = function(){
	this.count = this.init;
};

/**
 * @since 0.122.0
 */
Counter.prototype.nextId = function(){
	return ++this.count;
};

/**
 * @since 0.122.0
 */
Counter.prototype.nextPrefix = function(){
	return SactoryConfig.config.prefix + this.nextId();
};

/**
 * @since 0.145.0
 */
Counter.prototype.nextBind = function(){
	return this.bind++;
};

/**
 * @since 0.145.0
 */
Counter.prototype.nextObservable = function(){
	return this.observable++;
};

/**
 * @since 0.145.0
 */
Counter.prototype.nextSubscription = function(){
	return this.subscription++;
};

const counter = new Counter((() => {
	let ret;
	if(typeof document != "undefined" && document.documentElement && document.documentElement.dataset.sactory) {
		ret = +document.documentElement.dataset.sactory;
		document.documentElement.removeAttribute("data-sactory");
	}
	return ret || 0;
})());

module.exports = counter;
