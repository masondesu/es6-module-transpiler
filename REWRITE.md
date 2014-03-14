Current API:

var compiler = new Compiler(src);  // parse out imports, exports, identifiers
var output = compiler.toCJS();  // iterate over parsed out nodes to rewrite source

New API:

var out = transpiler.toCJS(src);  // parse and rewrite-as-you-go source tree
