const gulp = require("gulp");
const append = require("gulp-append-prepend").appendText;
const prepend = require("gulp-append-prepend").prependText;
const babel = require("gulp-babel");
const clone = require("gulp-clone");
const concat = require("gulp-concat");
const nop = require("gulp-nop");
const rename = require("gulp-rename");
const replace = require("gulp-replace");
const sourcemaps = require("gulp-sourcemaps");
const terser = require("gulp-terser");
const es = require("event-stream");

const { version } = require("./version");

const nos = Object("");
const debugExp = /\/\* debug:([\s\S]*?)\*\//g;

function makeImpl(filename, className, declare, debug, sources) {

	let header = `var toString=function(){return Object.toString().replace(/Object/,"${className}").replace(/native/,"sactory")};` +
		`${className}.toString=toString.toString=toString;Object.defineProperty(${className},"VERSION",{value:"${version}"});` +
		`Object.defineProperty(${className},"BUILT",{value:"${new Date().toISOString()}"});`;
	let reserved = [className, "Widget", "Builder", "Bind", "Subscription", "Dependency", "Observable", "ComputedObservable", "DeferredObservable", "Orray", "Color", "RGBColor", "HSLColor", "Parser", "ParserError"];

	if(declare) {
		header += `function ${className}(){}`;
	}

	var stream = gulp.src(sources.map(s => "src/" + s + ".js"))
		.pipe(sourcemaps.init())
		.pipe(concat(filename + ".js"))
		.pipe(replace(/var Sactory = {};?/gm, ""))
		.pipe(replace(/(var {?[a-zA-Z0-9_,:\s]+}? = )?require\(\"[a-zA-Z0-9_\-\.\/]*\"\)[a-zA-Z0-9_\.]*;/gm, ""))
		.pipe(replace(/(module\.exports = {?[a-zA-Z0-9_,\s\.]*}?;)/gm, ""))
		.pipe(replace(/(Sactory[A-Za-z]+)/gm, className));

	if(debug) {
		// uncomment debug expressions
		stream = stream.pipe(replace(debugExp, "/* debug: */$1"));
	}

	var module = stream.pipe(clone())
		.pipe(prepend(header, nos));

	var modulePretty = module.pipe(clone())
		.pipe(append(`export default ${className};`, nos))
		.pipe(rename(filename + ".module.js"))
		.pipe(sourcemaps.write("./maps"))
		.pipe(gulp.dest("dist"));

	var moduleUgly = module.pipe(clone())
		.pipe(terser({mangle: {toplevel: true, reserved}}))
		.pipe(append(`export default ${className};`, nos))
		.pipe(rename(filename + ".module.min.js"))
		.pipe(sourcemaps.write("./maps"))
		.pipe(gulp.dest("dist"));

	var amd = stream.pipe(clone())
		.pipe(prepend(`!function(a){if(typeof define=='function'&&define.amd){define(a);}else{window.${className}=a();}}(function(){${header}`, nos))
		.pipe(append(`return ${className};});`, nos));

	var amdPretty = amd.pipe(clone())
		.pipe(sourcemaps.write("./maps"))
		.pipe(gulp.dest("dist"));

	var amdUgly = amd.pipe(clone())
		.pipe(babel({
			presets: ["babel-preset-env"],
			minified: true,
			comments: false
		}))
		.pipe(terser({mangle: {toplevel: true, reserved}}))
		.pipe(rename(filename + ".min.js"))
		.pipe(sourcemaps.write("./maps"))
		.pipe(gulp.dest("dist"));

	return es.merge(modulePretty, moduleUgly, amdPretty, amdUgly).pipe(nop());

}

function make(filename, className, declare, debug, sources) {
	return es.merge(
		makeImpl(filename, className, declare, false, sources),
		makeImpl(filename + ".debug", className, declare, true, sources.concat(debug))
	).pipe(nop());
}

gulp.task("dist:sactory", () => make("sactory", "Sactory", false, [], [
	"polyfill",
	"attr",
	"util",
	"runtime/config", // must be first
	"runtime/counter", // must be before bind
	"runtime/bind",
	"runtime/core",
	"runtime/chain",
	"runtime/const",
	"runtime/context",
	"runtime/client",
	"runtime/misc",
	"runtime/observable",
	"runtime/style",
	"runtime/twoway",
	"runtime/widget",
	"runtime/widgets"
]));

gulp.task("dist:sactory-observable", () => makeImpl("sactory-observable", "Sactory", true, false, [
	"runtime/context",
	"runtime/counter",
	"runtime/observable"
]));

gulp.task("dist:transpiler", () => makeImpl("transpiler", "Transpiler", false, false, [
	"polyfill",
	"attr",
	"transpiler/util",
	"transpiler/parser",
	"transpiler/generated",
	"transpiler/mode",
	"transpiler/transpiler",
	"transpiler/eval"
]));

gulp.task("dist", gulp.parallel("dist:sactory", "dist:sactory-observable", "dist:transpiler"));
