var esprima = require('esprima');
var recast = require("recast");

var n = recast.types.namedTypes;
var b = recast.types.builders;

// TODO: should these be configurable?
const MODULE_OBJECT_NAME = '__es6_module__';
const REGISTRY_NAME = '__es6_module_registry__';
const TRANSPILED_FLAG = '__es6_transpiled__';

class Rewriter {
  constructor(opts) {
    var src = opts.src;
    this.moduleName = opts.name;

    this.ast = esprima.parse(src, {comments: true});

    // a mapping of imported modules to their unique identifiers
    // i.e. `./a` -> `__import_0__`
    this.importedModuleIdentifiers = {};

    // a list of each module that's been imported so far
    this.importedModules = {};

    // a mapping of imported identifiers to their original name and module
    // identifier
    // `import {a as b} from "foo" ->
    // { b: { name: a, moduleIdentifier: __import_0__ }}
    this.identifiers = {};

    // used to generate __import_n__ identifiers
    this.importCounter = 0;
  }

  insertPreamble() {
    this.ast.body.unshift(
      // if (!__es6_registry__) { __es6_registry__ = {}; }
      //
      // this boilerplate should be CJS/non-browser only, up to build step to prefix otherwise
      // (or maybe just option passed to compiler {ensureRegistryExists: true}
      b.ifStatement(
        b.unaryExpression(
          '!',
          b.identifier(REGISTRY_NAME)
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
            b.literal(this.moduleName),
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

  /* Add each imported specifier to this.identifiers */
  trackImport(node, specifier) {
    var alias = (specifier.name || specifier.id).name;
    var importName;
    if (node.kind === 'default') {
      importName = 'default';
    } else {
      importName = specifier.id.name;
    }

    var source = node.source.value;

    // Give the imported module a unique name if it doesn't have one yet
    // (break into trackModule() ?)
    if ( this.importedModuleIdentifiers[source] === undefined ) {
      var identifier = `__imports_${this.importCounter}__`;
      this.importedModuleIdentifiers[source] = identifier;
      this.importCounter += 1;
    }

    this.identifiers[alias] = {
      name: importName,
      importIdentifier: this.importedModuleIdentifiers[source]
    };
  }

  replaceImportDeclaration(source) {
    var replacement;

    if ( !this.importedModules[source] ) {

      // replace w/ __es6_modules__['name'] = require('name');
      replacement = b.expressionStatement(
        b.assignmentExpression(
          '=',
          // left
          b.identifier(this.importedModuleIdentifiers[source]),
          // right
          b.callExpression(
            b.identifier('require'), [
              b.literal(source)
            ]
          )
        )
      );

      this.importedModules[source] = true;
    } else {
      replacement = null;
    }

    return replacement;
  }

  replaceImportedIdentfier(identifier) {
    var isDefault = identifier.name === 'default';

    return b.memberExpression(
      b.identifier(identifier.importIdentifier),
      isDefault ? b.literal(identifier.name) : b.identifier(identifier.name),
      isDefault ? true : false
    );
  }

  replaceExportDeclaration(node) {
    var declaration = node.declaration;

    return b.expressionStatement(
      b.assignmentExpression(
        '=',
        b.memberExpression(
          b.identifier(MODULE_OBJECT_NAME),
          b.identifier(declaration.id.name),
          false
        ),
        declaration
      )
    );
  }

  rewrite() {
    var rewriter = this;  // traverse cb needs to be able to ref its `this`

    this.insertPreamble();

    recast.types.traverse(this.ast, function(node) {
      var replacement;

      if ( n.ImportDeclaration.check(node) ) {
        var source = node.source.value;
        node.specifiers.forEach(rewriter.trackImport.bind(rewriter, node));
        replacement = rewriter.replaceImportDeclaration(source);
      } else if ( n.ExportDeclaration.check(node) ) {
        replacement = rewriter.replaceExportDeclaration(node);
      } else if ( n.Identifier.check(node) ) {
        if ( node.name in rewriter.identifiers ) {

          // if REDECLARED don't use
          // redclared == scope != global scope?
          var scope = this.scope.lookup(node.name);
          if ( scope.depth === 0 ) {
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
