var Polyfill = require("../polyfill");

var Sactory = {};

const globalDocument = typeof document != "undefined" ? document : undefined;

/**
 * @since 0.132.0
 */
Sactory.contextFromArguments = Sactory.cfa = function(context, args, from){
	for(var i=args.length; i>from; i--) {
		var arg = args[i - 1];
		if(arg && arg.__context) {
			return arg;
		}
	}
	return context;
};

/**
 * Creates a new context by merging the current context and a new context.
 * The priority is also increased.
 * @since 0.128.0
 */
Sactory.newContext = function(context, newContext){
	return Polyfill.assign({__context: true}, context, newContext);
};

/**
 * Creates a new context from scratch, using {@link context} to get the
 * right context, suitable to be used in chaining.
 * @since 0.128.0
 */
Sactory.newChainContext = function(context){
	return (({element, namespace, top, bind, anchor, registry, selector, document}) => ({
		__context: true,
		namespace,
		top, bind, anchor, registry, selector,
		parentElement: element,
		parentAnchor: anchor,
		document: document || element && element.ownerDocument || globalDocument
	}))(context);
};

/**
 * Creates a new context based on another context, replacing bind, anchor and element, which
 * is always set to the anchor's parent, if the anchor is defined.
 * @since 0.138.0
 */
Sactory.newBindContext = function(context, bind, anchor){
	return Sactory.newContext(context, {element: anchor && anchor.parentNode, top: true, bind, anchor});
};

/**
 * Gets the preferred element in the given context.
 * @since 0.128.0
 */
Sactory.currentElement = function(context){
	return context.content || context.container || context.element || context.parentElement;
};

module.exports = Sactory;
