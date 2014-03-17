require('../lib/traceur-runtime');

var CJSRewriter = require('./cjs_rewriter');
var AMDRewriter = require('./amd_rewriter');

module.exports = {
  toCJS: function(src) {
    var rewriter = new CJSRewriter(src);
    return rewriter.rewrite();
  },
  toAMD: function(src) {
    var rewriter = new AMDRewriter(src);
    return rewriter.rewrite();
  }
};
