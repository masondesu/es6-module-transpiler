var esprima = require('esprima');
var recast = require("recast");

var n = recast.types.namedTypes;
var b = recast.types.builders;

const GLOBAL_NAME = '__es6_module_registry__';

class Rewriter {
  constructor(src) {
    this.src = src;

    this.ast = esprima.parse(src);

    this.importedModuleNames = [];
    this.identifiers = {};
  }

  trackImport(node, specifier) {
    console.log(specifier.id);
    var alias = (specifier.name || specifier.id).name;
    var importName;
    if (node.kind === 'default') {
      importName = 'default';
    } else {
      importName = specifier.id.name;
    }

    this.identifiers[alias] = {
      name: importName,
      moduleName: node.source.value
    };
  }

  replaceImportDeclaration(source) {
    var replacement;
    if ( !this.importedModuleNames[source] ) {
      // replace w/ __es6_modules__['name'] = require('name');
      replacement = b.expressionStatement(
        b.assignmentExpression(
          '=',
          // left
          b.memberExpression(
            b.identifier(GLOBAL_NAME),
            b.literal(source),
            true
          ),
          // right
          b.callExpression(
            b.identifier('require'), [
              b.literal(source)
            ]
          )
        )
      );
    } else {
      replacement = null;
    }

    return replacement;
  }

  replaceImportedIdentfier(identifier) {
    var isDefault = identifier.name === 'default';

    return b.memberExpression(
      b.memberExpression(
        b.identifier(GLOBAL_NAME),
        b.literal(identifier.moduleName),
        true
      ),
      isDefault ? b.literal(identifier.name) : b.identifier(identifier.name),
      isDefault ? true : false
    );
  }

  rewrite() {
    var rewriter = this;  // traverse cb needs to be able to ref its `this`

    recast.types.traverse(this.ast, function(node) {
      var replacement;

      if ( n.ImportDeclaration.check(node) ) {
        var source = node.source.value;
        node.specifiers.forEach(rewriter.trackImport.bind(rewriter, node));
        replacement = rewriter.replaceImportDeclaration(source);
      } else if ( n.ExportDeclaration.check(node) ) {
        // TODO
      } else if ( n.Identifier.check(node) ) {
        if ( node.name in rewriter.identifiers ) {
          // null = hasn't been redefined
          if ( this.scope.lookup(node) === null) {
            replacement = rewriter.replaceImportedIdentfier(rewriter.identifiers[node.name]);
          }
        }
      }

      if ( replacement !== undefined ) {
        this.replace(replacement);
      }
    });

    return recast.print(this.ast);
  }
}

module.exports = Rewriter;
