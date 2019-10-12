var Polyfill = require("../polyfill");
var { hyphenate, dehyphenate } = require("../util");
var SactoryConst = require("./const");
var counter = require("./counter");
var SactoryObservable = require("./observable");

var Sactory = {};

const valueModifiers = {
	number: value => +value,
	int: value => Polyfill.trunc(value),
	str: value => value + "",
	date(value) {
		const [y, m, d] = value.split("-");
		return new Date(y, m - 1, d || 1);
	},
	time(value) {
		const [h, m] = value.split(":");
		const ret = new Date();
		ret.setHours(h);
		ret.setMinutes(m);
		ret.setSeconds(0);
		ret.setMilliseconds(0);
		return ret;
	},
	comma: value => value.replace(/,/g, "."),
	trim: String.prototype.trim,
	"trim-start": Polyfill.trimStart,
	"trim-end": Polyfill.trimEnd,
	lower: String.prototype.toLowerCase,
	lowercase: String.prototype.toLowerCase,
	upper: String.prototype.toUpperCase,
	uppercase: String.prototype.toUpperCase,
	capital: value => value.charAt(0).toUpperCase() + value.substr(1),
	hyphenate, dehyphenate
};

// aliases
valueModifiers.num = valueModifiers.number;
valueModifiers.string = valueModifiers.str;
valueModifiers.capitalize = valueModifiers.capital;

/**
 * @since 0.46.0
 */
Sactory.bindInput = function({bind}, element, {type, info, value, update}){
	const isObservable = SactoryObservable.isObservable(value);
	const events = info.split("::");
	const modifiers = events.shift();
	const updateType = SactoryConst.OUT_FORM_RANGE_START + Math.floor(Math.random() * SactoryConst.OUT_FORM_RANGE_LENGTH);
	const select = element.tagName.toUpperCase() == "SELECT";
	let get, set, converters = [];
	// set the type if needed
	if(type && type != "value") {
		// some browsers may throw an exception when settings the `type` property to an invalid value
		element.setAttribute("type", type);
	}
	// calculate property name and default converter
	if(select) {
		if(element.multiple) {
			// select multiple, returns an array
			get = callback => callback(Array.prototype.map.call(selectedOptions(element),
				option => option.value));
			set = value => Array.prototype.forEach.call(element.options,
				option => option.selected = value.indexOf(option.value) != -1);
		} else {
			// normal select, just get and set the element's value
			get = callback => callback(element.value);
			set = value => element.value = value;
		}
	} else if(element.type == "checkbox") {
		// classic boolean binding using the element's `checked` property
		get = callback => callback(element.checked);
		set = value => element.checked = value;
	} else if(element.type == "radio") {
		// the event is called only when radio is selected
		get = callback => callback(element.value);
		set = value => element.checked = value == element.value;
		if(isObservable) {
			// make sure that the radio buttons that depend on the same observable have
			// the same name and are in the same radio group
			if(!element.name) {
				element.name = value._radioGroupName || (value._radioGroupName = counter.nextPrefix());
			}
		}
	} else {
		// normal input, values that are `null` and `undefined` are treated as empty strings
		get = callback => callback(element.value);
		set = value => element.value = value === null || value === undefined ? "" : value;
	}
	// subscribe if needed and/or update element's value
	if(isObservable) {
		value.subscribe({bind}, set, updateType);
		set(value.value);
	} else {
		set(value);
	}
	// calculate the default event type if none was specified
	if(!events.length) {
		if(select || element.type == "checkbox" || element.type == "radio") {
			events.push("change");
		} else {
			events.push("input");
		}
	}
	if(modifiers) {
		modifiers.split(":").forEach(mod => {
			if(mod.args) {
				mod = mod.toValue();
				if(typeof mod == "function") {
					converters.push(mod);
					return;
				}
			}
			if(Object.prototype.hasOwnProperty.call(valueModifiers, mod)) {
				converters.push(valueModifiers[mod]);
			} else {
				throw new Error("Unknown value modifier '" + mod + "'.");
			}
		});
	}
	if(isObservable) {
		// call the observable's update with the correct update type
		converters.push(newValue => {
			value.currentType = updateType;
			update(newValue);
			delete value.currentType;
		});
	} else {
		// not an observable, simply call the update function
		converters.push(update);
	}
	events.forEach(type => {
		element["~builder"].event(type, () => {
			get(newValue => converters.forEach(converter => newValue = converter.call(newValue, newValue)));
		}, bind);
	});
};

/**
 * @since 0.146.0
 */
Sactory.$$bindInput = Sactory.bindInput;

// polyfill


const selectedOptions = typeof HTMLSelectElement == "function" &&
	Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "selectedOptions") ? 
	select => select.selectedOptions :
	select => Array.prototype.filter.call(select.options, option => option.selected);

module.exports = Sactory;
