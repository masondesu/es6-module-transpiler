require('../lib/traceur-runtime');

var rewriters = {
  cjs: require('./cjs_rewriter'),
  amd: require('./amd_rewriter')
};

module.exports = {
  transpile: function(src, type, opts) {
    var Rewriter = rewriters[type];
    if ( !Rewriter ) {
      /* jshint ignore:start */
      throw new Error(`No transpiler found for type ${type}!`);
      /* jshint ignore:end */
    }

    return new Rewriter(src, opts).rewrite();
  }
};
