var performance = require("perf_hooks").performance;

function hash(str) {
	var hash = 0;
	for(var i=0; i<str.length; i++) {
		hash += str.charCodeAt(i) * 16777619;
	}
	return hash;
}

function now() {
	return performance.now ? performance.now() : new Date().getTime();
}

function optimize(value) {
	const match = value.match(/^((?:[a-zA-Z0-9_$]+\.)*)\*([a-zA-Z0-9_$]+)$/);
	return match && match.slice(1).join("");
}

function stringify(str) {
	// that's not very fast
	return "\"" + str.replace(/(\r?\n)|([\\"])/gm, function(_, newline, escaped){
		if(newline) return "\\n\\\n";
		else return "\\" + escaped;
	}) + "\"";
}

module.exports = { hash, now, optimize, stringify };
