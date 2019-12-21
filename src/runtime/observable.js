var Polyfill = require("../polyfill");
var SactoryConst = require("./const");
var counter = require("./counter");

var Sactory = {};

/* debug:
const subscriptions = {};
Object.defineProperty(Sactory, "subscriptions", {get: () => Object.values(subscriptions)});
*/

/**
 * Stores a subscription to an observable.
 * @param {Observable} observed - The observable that dispatches the update.
 * @param {function(newValue, oldValue, type, args)} callback - Callback function called when the observable is updated.
 * @param {number=} type - If the type passed to the observable's update function matches the given type, the callback is not called.
 * @class
 * @since 0.129.0
 */
function Subscription(observed, callback, type) {
	Object.defineProperty(this, "id", {value: counter.nextSubscription()});
	this.observed = observed;
	this.callback = callback;
	this.type = type;
	this.disposed = false;
}

/**
 * Disposes the subscription and stops receiving updates from the
 * observed observable.
 * @since 0.129.0
 */
Subscription.prototype.dispose = function(){
	this.disposed = true;
	this.observed.unsubscribe(this);
};

/**
 * @param {ComputedObservable} observer - The computed observable that receives the update, if the subscription is a dependency.
 * @since 0.146.0
 */
function Dependency(observed, observer, callback) {
	Subscription.call(this, observed, callback);
	this.observer = observer;
}

Dependency.prototype = Object.create(Subscription.prototype);

/**
 * Stores an observable, its value and its subscribers.
 * @param {*} value - The initial value of the observable.
 * @class
 * @since 0.129.0
 */
function Observable(context, value) {
	Object.defineProperty(this, "id", {value: counter.nextObservable()});
	this.context = context;
	this.bindId = context.bind && context.bind.id;
	this._subscriptions = [];
	this._value = this.wrapValue(value);
}

/**
 * @since 0.145.0
 */
Observable.prototype.subscribeImpl = function(context, subscription){
	this._subscriptions.push(subscription);
	if(context && context.bind && context.bind.id !== this.bindId) {
		context.bind.subscribe(subscription);
	} /* debug: else if(context && context.bind) {
		context.bind.subscribe(subscription);
	}
	subscriptions[subscription.id] = subscription; */
	return subscription;
};

/**
 * @since 0.129.0
 */
Observable.prototype.subscribe = function(context, callback, type){
	return this.subscribeImpl(context, new Subscription(this, callback, type));
};

/**
 * @since 0.145.0
 */
Observable.prototype.depend = function(context, callback, observer){
	return this.subscribeImpl(context, new Dependency(this, observer, callback));
};

/**
 * @param {Subscription} subscription
 * @returns Whether the subscription was removed.
 * @since 0.129.0
 */
Observable.prototype.unsubscribe = function({id}){
	for(let i=0; i<this._subscriptions.length; i++) {
		const sub = this._subscriptions[i];
		if(sub.id == id) {
			this._subscriptions.splice(i, 1);
			/* debug: delete subscriptions[id]; */
			return true;
		}
	}
	return false;
};

/**
 * @since 0.130.0
 */
Observable.prototype.$$subscribe = function(context, callback, type){
	return this.subscribe(context, callback, type);
};

/**
 * @since 0.129.0
 */
Observable.prototype.propagateUpdate = function(newValue, oldValue, type, args){
	this._subscriptions.forEach(sub => {
		if(!sub.type || sub.type != type) {
			sub.callback(newValue, oldValue, type, args);
		}
	});
};

/**
 * @since 0.129.0
 */
Observable.prototype.triggerUpdate = function(type, args){
	this.propagateUpdate(this._value, this._value, type, args);
};

/**
 * @since 0.129.0
 */
Observable.prototype.update = function(value, type, args){
	if(this.shouldUpdate(this._value, value)) {
		var oldValue = this._value;
		this._value = this.wrapValue(value);
		this.propagateUpdate(value, oldValue, type || this.currentType, args);
	}
};

/**
 * Indicates whether the observable should update when the value is changed by
 * calling the `update` method. It is true by default on normal observables
 * and is only true in computed observables when `newValue` is different from
 * `oldValue`.
 * @since 0.129.0
 */
Observable.prototype.shouldUpdate = function(newValue, oldValue){
	return true;
};

/**
 * @since 0.129.0
 */
Observable.prototype.wrapValue = function(value){
	if(value instanceof Observable) {
		// copy observable
		value = value.value;
	}
	if(value instanceof Orray) {
		// set observable
		Object.defineProperty(value, "observable", {
			enumerable: false,
			configurable: true,
			value: this
		});
	}
	return value;
};

/**
 * @since 0.129.0
 */
Object.defineProperty(Observable.prototype, "value", {
	configurable: true,
	get() {
		return this._value;
	},
	set(value) {
		this.update(value);
	}
});

// conversion

Observable.prototype.valueOf = function(){
	return this._value;
};

Observable.prototype.toJSON = function(){
	return this._value && this._value.toJSON ? this._value.toJSON() : this._value;
};

Observable.prototype.toString = function(){
	return this._value + "";
};

// modifiers

Observable.prototype.storage = function(storage, key, version){
	this._key = key + (version ? "__v" + version : "");
	var sup = this.propagateUpdate;
	Object.defineProperty(this, "propagateUpdate", {
		value(value) {
			storage.setItem(this._key, JSON.stringify(value));
			sup.apply(this, arguments);
		}
	});
	var item = storage.getItem(this._key);
	if(item) {
		this.value = JSON.parse(storage.getItem(this._key));
	}
	return this;
};

var noStorage = type => function(key){
	console.warn(type + " is not available. Observable assigned to key '" + key + "' will not be saved to it.");
	return this;
};

if(typeof localStorage != "undefined") {
	Observable.prototype.localStorage = function(key, version){
		return this.storage(localStorage, key, version);
	};
} else {
	Observable.prototype.localStorage = noStorage("localStorage");
}

if(typeof sessionStorage != "undefined") {
	Observable.prototype.sessionStorage = function(key, version){
		return this.storage(sessionStorage, key, version);
	};
} else {
	Observable.prototype.sessionStorage = noStorage("sessionStorage");
}

/**
 * @since 0.145.0
 */
Observable.prototype.transform = function(fun){
	if(this.converters) {
		this.converters.push(fun);
	} else {
		this.converters = [fun];
		const wrapValue = this.wrapValue;
		Object.defineProperty(this, "wrapValue", {
			value(value) {
				this.converters.forEach(fun => value = fun(value));
				return wrapValue.call(this, value);
			}
		});
	}
	return this;
};

/**
 * @since 0.145.0
 */
Observable.prototype.validate = function(fun, defaultValue){
	return this.transform(value => fun(value) ? value : defaultValue);
};

const queue = typeof queueMicrotask === "function" ? queueMicrotask :
	typeof Promise === "function" ? fun => Promise.resolve().then(fun) :
	typeof setImmediate === "function" ? setImmediate : setTimeout;

/**
 * @class
 * @since 0.145.0
 */
function ComputedObservable(context, fun){
	Observable.call(this, context);
	this.fun = fun;
	this.deps = this.ndeps = {};
	this.tracker = new Tracker(this);
	this._value = this.wrapValue(fun(this.tracker));
	this.ndeps = {};
}

ComputedObservable.prototype = Object.create(Observable.prototype);

ComputedObservable.prototype.recalc = function(){
	// store the ids of dependencies before recalc
	this.odeps = Polyfill.assign({}, this.deps);
	this.value = this.fun(this.tracker);
	// remove unused dependencies
	for(let id in this.odeps) {
		if(!this.ndeps[id]) {
			this.odeps[id].dispose();
		}
	}
	this.deps = this.ndeps;
	this.odeps = this.ndeps = {};
};

ComputedObservable.prototype.onDepencyChange = function(){
	this.recalc();
};

ComputedObservable.prototype.shouldUpdate = function(newValue, oldValue){
	return newValue !== oldValue;
};

/**
 * @since 0.142.0
 */
ComputedObservable.prototype.always = function(){
	Object.defineProperty(this, "shouldUpdate", {value: () => true});
	return this;
};

/**
 * @since 0.147.0
 */
ComputedObservable.prototype.throttle = function(duration){
	Object.defineProperty(this, "onDepencyChange", {
		value() {
			if(this._throttle) {
				// already throttling, reset it
				clearTimeout(this._throttle);
			}
			this._throttle = setTimeout(() => {
				this._throttle = false;
				this.recalc();
			}, duration);
		}
	});
	return this;
};

/**
 * @since 0.147.0
 */
ComputedObservable.prototype.lazy = function(){
	Object.defineProperty(this, "onDepencyChange", {
		value() {
			if(!this._throttle) {
				this._throttle = true;
				queue(() => {
					this._throttle = false;
					this.recalc();
				});
			}
		}
	});
	return this;
};

let currentQueue;

/**
 * @class
 * @since 0.148.0
 */
function DeferredObservable(context, fun) {
	ComputedObservable.call(this, context, fun);
}

DeferredObservable.prototype = Object.create(ComputedObservable.prototype);

DeferredObservable.prototype.onDepencyChange = function(){
	if(!currentQueue) {
		window.queue = currentQueue = [];
	}
	this.onDepencyChangeImpl();
};

DeferredObservable.prototype.onDepencyChangeImpl = function(){
	if(this._queued) {
		// remove from the queue by performing a reverse search by id
		for(let i=currentQueue.length-1; i>=0; i--) {
			if(currentQueue[i].id === this.id) {
				currentQueue.splice(i, 1);
				break;
			}
		}
	} else {
		this._queued = true;
	}
	// mark this observable as possible update
	currentQueue.push(this);
	//TODO call onDependencyChange on every child that is also deferred
	this._subscriptions.forEach(subscription => {
		if(subscription.observer && subscription.observer instanceof DeferredObservable) {
			subscription.observer.onDepencyChangeImpl();
		}
	});
};

/**
 * @class
 * @since 0.145.0
 */
function Tracker(observable) {
	this.observable = observable;
	this.context = observable.context;
}

Tracker.prototype.add = function(observable){
	const {id} = observable;
	if(!this.observable.deps[id]) {
		this.observable.ndeps[id] = observable.depend(this.context, () => {
			this.observable.onDepencyChange();
		}, this.observable);
	} else {
		this.observable.ndeps[id] = this.observable.deps[id];
	}
};

/**
 * Adds a dependency.
 */
Tracker.prototype.a = function(value){
	this.add(value);
	return value.value;
};

/**
 * Adds a maybe dependency.
 */
Tracker.prototype.b = function(value){
	if(Sactory.isObservable(value)) {
		return this.a(value);
	} else {
		return value;
	}
};

/**
 * Adds a dependency and calls the function.
 */
Tracker.prototype.c = function(value, fun){
	this.add(value);
	return fun(this, value.value);
};

/**
 * Adds a maybe dependency and calls the function.
 */
Tracker.prototype.d = function(value, fun){
	if(Sactory.isObservable(value)) {
		return this.c(value, fun);
	} else {
		return fun(this, value);
	}
};

/**
 * @class
 * @since 0.66.0
 */
function Orray(values) {
	Array.prototype.push.apply(this, values);
	const length = this.length;
	Object.defineProperty(this, "length", {
		configurable: false,
		enumerable: false,
		writable: true,
		value: length
	});
}

Orray.prototype = Object.create(Array.prototype);

const redefine = (prop, value) => {
	Object.defineProperty(Orray.prototype, prop, {
		enumerable: false,
		value
	});
};

[
	["copyWithin"],
	["fill"],
	["pop", SactoryConst.OUT_ARRAY_POP],
	["push", SactoryConst.OUT_ARRAY_PUSH],
	["reverse", SactoryConst.OUT_ARRAY_REVERSE],
	["shift", SactoryConst.OUT_ARRAY_SHIFT],
	["sort"],
	["splice", SactoryConst.OUT_ARRAY_SPLICE],
	["unshift", SactoryConst.OUT_ARRAY_UNSHIFT]
].forEach(([prop, type]) => {
	if(Array.prototype[prop]) {
		redefine(prop, function(){
			const ret = Array.prototype[prop].apply(this, arguments);
			this.observable.triggerUpdate(type, arguments);
			return ret;
		});
	}
});

["concat", "slice", "filter", "map"].forEach(prop => {
	redefine(prop, function(){
		return new Orray(Array.prototype[prop].apply(this, arguments));
	});
});

redefine("set", function(index, value){
	this[index] = value;
	this.observable.triggerUpdate(SactoryConst.OUT_ARRAY_SET, [index, value]);
	return value;
});

redefine("toJSON", function(){
	return Array.apply(null, this);
});

/**
 * @since 0.147.0
 */
Sactory.orray = function(...values){
	return new Orray(values);
};

/**
 * Creates an observable from the given value.
 * @since 0.129.0
 */
Sactory.cofv = function(context, value){
	return new Observable(context, value);
};

/**
 * Creates a computed observable from the given function.
 * @since 0.129.0
 */
Sactory.coff = function(context, fun){
	return new ComputedObservable(context, fun);
};

/**
 * Creates a deferred computed observable from the given function.
 * @since 0.129.0
 */
Sactory.cofd = function(context, fun){
	return new DeferredObservable(context, fun);
};

/**
 * Indicates whether the given value is an instance of {@link Observable}.
 * @since 0.40.0
 */
Sactory.isObservable = function(value){
	return value instanceof Observable;
};

/**
 * @since 0.147.0
 */
Sactory.isComputedObservable = function(value){
	return value instanceof ComputedObservable;
};

/**
 * @since 0.148.0
 */
Sactory.isDeferredObservable = function(value){
	return value instanceof DeferredObservable;
};

/**
 * @since 0.147.0
 */
Sactory.isOrray = function(value){
	return value instanceof Orray;
};

/**
 * If the given value is an observable returns the observable's value,
 * otherwise returns the given value.
 * @since 0.86.0
 */
Sactory.value = function(value){
	if(Sactory.isObservable(value)) {
		return value.value;
	} else {
		return value;
	}
};

module.exports = Sactory;
