var recast = require("recast");
var n = recast.types.namedTypes;
var b = recast.types.builders;

var Rewriter = require('./rewriter');

// TODO: should these be configurable?
const MODULE_OBJECT_NAME = '__es6_module__';
const REGISTRY_NAME = '__es6_module_registry__';
const TRANSPILED_FLAG = '__es6_transpiled__';

class CJSRewriter extends Rewriter {
  insertPreamble() {
    this.ast.body.unshift(
      // if (!__es6_registry__) { __es6_registry__ = {}; }
      //
      // this boilerplate should be CJS/non-browser only, up to build step to prefix otherwise
      // (or maybe just option passed to compiler {ensureRegistryExists: true}
      b.ifStatement(
        b.binaryExpression(
          '===',
          b.unaryExpression(
            'typeof',
            b.identifier(REGISTRY_NAME)
          ),
          b.literal('undefined')
        ),
        b.blockStatement([
          b.expressionStatement(
            b.assignmentExpression(
              '=',
              b.identifier(REGISTRY_NAME),
              b.objectExpression([])
            )
          )
        ])
      ),

      // var __es6_module__ = {};
      b.variableDeclaration(
        'var',
        [b.variableDeclarator(
          b.identifier(MODULE_OBJECT_NAME),
          b.objectExpression([
            b.property(
              'init',
              b.literal(TRANSPILED_FLAG),
              b.literal(true)
            )
          ])
        )]
      ),

      // __es6_module_registry__["name"] = module.exports = __es6_module__;
      b.expressionStatement(
        b.assignmentExpression(
          '=',
          b.memberExpression(
            b.identifier(REGISTRY_NAME),
            b.literal(this.registryName),
            true
          ),
          b.assignmentExpression(
            '=',
            b.memberExpression(
              b.identifier('module'),
              b.identifier('exports'),
              false
            ),
            b.identifier(MODULE_OBJECT_NAME)
          )
        )
      )
    );
  }

  replaceImportDeclaration(source) {
    var replacement;

    if ( !this.importedModules[source] ) {

      // replace w/ __import_0__ = __es6_module_registry__['name'] || require('name');
      replacement = b.variableDeclaration('var', [
        b.variableDeclarator(
          b.identifier(this.importedModuleIdentifiers[source]),
          b.logicalExpression(
            '||',
            b.memberExpression(
              b.identifier(REGISTRY_NAME),
              b.literal(this.resolvePath(source)),
              true
            ),
            b.callExpression(
              b.identifier('require'), [
                b.literal(source)
              ]
            )
          )
        )]
      );

      this.importedModules[source] = true;
    } else {
      replacement = null;
    }

    return replacement;
  }

  replaceExportDeclaration(node) {
    // TODO: generalize for multiple declarations:
    // export var foo = 1, bar = 2;
    var declaration = node.declaration[0];
    var exportName = declaration.id.name;

    // TODO: there are so many other cases here, lol
    if (n.VariableDeclarator.check(declaration)) {
      if (declaration.id.name === 'default') {
        declaration = declaration.init;
      }
    }

    return b.expressionStatement(
      b.assignmentExpression(
        '=',
        b.memberExpression(
          b.identifier(MODULE_OBJECT_NAME),
          b.identifier(exportName),
          false
        ),
        declaration
      )
    );
  }
}

module.exports = CJSRewriter;
