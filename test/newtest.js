var transpiler = require('../dist');
var fs = require('fs');
var inA = fs.readFileSync('./features/scope_check.es6.js');

var out = transpiler.toCJS({
  src: inA,
  name: 'scope_check'
});
console.log(out.code);
