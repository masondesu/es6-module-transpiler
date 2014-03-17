var esprima = require('esprima');
var recast = require("recast");

var n = recast.types.namedTypes;
var b = recast.types.builders;

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

  replaceImportedIdentfier(identifier) {
    var isDefault = identifier.name === 'default';

    return b.memberExpression(
      b.identifier(identifier.importIdentifier),
      isDefault ? b.literal(identifier.name) : b.identifier(identifier.name),
      isDefault ? true : false
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

          // if redeclared, don't rewrite
          var scope = this.scope.lookup(node.name);

          // scope === null is true because at this point we've removed the "declaring" import
          if ( scope === null ) {
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
