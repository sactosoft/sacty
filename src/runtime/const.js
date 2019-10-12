var Sactory = {};

Object.defineProperty(Node, "ANCHOR_NODE", {
	writable: false,
	enumerable: true,
	configurable: false,
	value: 99
});

// namespaces

Sactory.NS_XHTML = "http://www.w3.org/1999/xhtml";
Sactory.NS_SVG = "http://www.w3.org/2000/svg";
Sactory.NS_MATHML = "http://www.w3.org/1998/mathml";
Sactory.NS_XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
Sactory.NS_XBL = "http://www.mozilla.org/xbl";

// slots

Sactory.SL_CONTAINER = "__container";
Sactory.SL_CONTENT = "__content";
Sactory.SL_INPUT = "__input";

// observable's update types

Sactory.OUT_ARRAY_SET = 1048570;
Sactory.OUT_ARRAY_PUSH = 1048571;
Sactory.OUT_ARRAY_POP = 1048572;
Sactory.OUT_ARRAY_UNSHIFT = 1048573;
Sactory.OUT_ARRAY_SHIFT = 1048574;
Sactory.OUT_ARRAY_SPLICE = 1048575;
Sactory.OUT_ARRAY_REVERSE = 1048576;
Sactory.OUT_FORM_RANGE_START = 1048576;
Sactory.OUT_FORM_RANGE_LENGTH = 1048576;

module.exports = Sactory;
