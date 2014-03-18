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
    this.ast.program.body.unshift(
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
      // if we've already imported the module, just remove the declaration
      replacement = null;
    }

    return replacement;
  }

  replaceExportSpecifiers(node) {

    var import_, importIdentifier, rightHand;
    if ( node.source ) {
      // reexport
      this.trackModule(node.source);
      import_ = this.replaceImportDeclaration(node.source.value);
      importIdentifier = import_.declarations[0].id.name;
    }

    var replacement = node.specifiers.map(function(specifier) {
      if (importIdentifier) {
        rightHand = b.memberExpression(
          b.identifier(importIdentifier),
          b.identifier(specifier.id.name),
          false
        );
      } else {
        rightHand = b.identifier(specifier.id.name);
      }

      return b.expressionStatement(
        b.assignmentExpression(
          '=',
          b.memberExpression(
            b.identifier(MODULE_OBJECT_NAME),
            b.identifier(specifier.id.name),
            false
          ),
          rightHand
        )
      );
    });

    return [import_].concat(replacement);
  }

  exportIdentifier(exportName) {
    var isDefault = exportName === 'default';

    return b.memberExpression(
      b.identifier(MODULE_OBJECT_NAME),
      isDefault ? b.literal(exportName) : b.identifier(exportName),
      isDefault ? true : false
    );
  }

  replaceExportDeclaration(declaration) {

    // For some reason, export default always wraps declaration in an array
    if ( Array.isArray(declaration) ) {
      declaration = declaration[0];
    }

    // TODO: This is really ugly, kinda tricky to follow :\
    if (n.VariableDeclarator.check(declaration)) {
      if (declaration.id.name === 'default') {
        // export default foo;
        return b.expressionStatement(
          b.assignmentExpression(
            '=',
            this.exportIdentifier(declaration.id.name),
            declaration.init
          )
        );
      } else {
        // export var [foo = 1], foo = 2;
        // (called recursively from VariableDeclaration)
        return b.expressionStatement(
          b.assignmentExpression(
            '=',
            this.exportIdentifier(declaration.id.name),
            b.identifier(declaration.id.name)
          )
        );
      }
    } else if (n.Declaration.check(declaration)) {
      if ( declaration.declarations ) {
        // export var foo = 1, foo = 2...;
        var decs = declaration.declarations.map(this.replaceExportDeclaration.bind(this));
        return [declaration].concat(decs);
      } else {
        // export function foo() {};
        return [declaration, b.expressionStatement(
          b.assignmentExpression(
            '=',
            this.exportIdentifier(declaration.id.name),
            b.identifier(declaration.id.name)
          )
        )];
      }
    }

  }
}

module.exports = CJSRewriter;
