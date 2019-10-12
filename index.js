var { version } = require("./version");

function merge(core, ...args) {
	args.forEach(arg => {
		for(var key in arg) {
			core[key] = arg[key];
		}
	});
	Object.defineProperty(core, "VERSION", {
		value: version
	});
	return core;
}

require("./src/dom"); // init globals

module.exports = merge(
	require("./src/runtime/chain"),
	require("./src/runtime/server"),
	require("./src/runtime/config"),
	require("./src/runtime/const"),
	require("./src/runtime/context"),
	require("./src/runtime/bind"),
	require("./src/runtime/misc"),
	require("./src/runtime/observable"),
	require("./src/runtime/style"),
	require("./src/runtime/twoway"),
	require("./src/runtime/widget"),
	require("./src/runtime/widgets")
);
