var transpiler = require('../dist');
var out = transpiler.toCJS('import foo from "bar"; function foobar() { console.log(foo); }');
console.log(out);
