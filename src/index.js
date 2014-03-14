require('../lib/traceur-runtime');

var Rewriter = require('./rewriter');

module.exports = {
  toCJS: function(src) {
    var rewriter = new Rewriter(src);
    return rewriter.rewrite();
  }
};
