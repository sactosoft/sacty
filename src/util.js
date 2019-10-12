function hyphenate(value) {
	var ret = "";
	for(var i=0; i<value.length; i++) {
		var code = value.charCodeAt(i);
		if(code >= 65 && code <= 90) {
			if(i > 0) ret += "-";
			ret += String.fromCharCode(code + 32);
		} else {
			ret += value.charAt(i);
		}
	}
	return ret;
}

function dehyphenate(value) {
	var ret = "";
	for(var i=0; i<value.length; i++) {
		if(value.charAt(i) == "-") {
			var code = value.charCodeAt(++i);
			if(code >= 97 && code <= 122) {
				ret += String.fromCharCode(code - 32);
			} else {
				ret += value.charAt(i);
			}
		} else {
			ret += value.charAt(i);
		}
	}
	return ret;
}

module.exports = { hyphenate, dehyphenate };
