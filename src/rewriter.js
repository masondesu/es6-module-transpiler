var esprima = require('esprima');
var recast = require('recast');
var path = require('path');

var n = recast.types.namedTypes;
var b = recast.types.builders;

class Rewriter {
  constructor(src, opts) {
    if ( !opts.registryName ) {
      throw new Error('You must pass a registryName to use');
    }

    this.registryName = opts.registryName;
    this.moduleName = opts.moduleName;
    this.dirPath = opts.dirPath;  // used to resolve relative imports

    this.ast = recast.parse(src, {esprima: esprima});

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

  trackModule(node) {
    var source = node.value;

    if ( this.importedModuleIdentifiers[source] === undefined ) {
      var identifier = `__imports_${this.importCounter}__`;
      this.importedModuleIdentifiers[source] = identifier;
      this.importCounter += 1;
    }
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

    recast.types.traverse(this.ast.program, function(node) {
      var replacement;
      this.scope.scan();  // always track scope, otherwise things get weird

      if ( n.ImportDeclaration.check(node) ) {
        var source = node.source.value;
        rewriter.trackModule(node.source);
        node.specifiers.forEach(rewriter.trackImport.bind(rewriter, node));
        replacement = rewriter.replaceImportDeclaration(source);
      } else if ( n.ExportDeclaration.check(node) ) {
        if ( node.declaration ) {
          replacement = rewriter.replaceExportDeclaration(node.declaration);
        } else if ( node.specifiers ) {
          replacement = rewriter.replaceExportSpecifiers(node);
        }
      } else if ( n.Identifier.check(node) ) {
        if ( node.name in rewriter.identifiers ) {
          var scope = this.scope.lookup(node.name);

          if ( scope.depth === 0 ) {
            replacement = rewriter.replaceImportedIdentfier(rewriter.identifiers[node.name]);
          }
        }
      }

      if ( replacement !== undefined ) {
        if ( Array.isArray(replacement) ) {
          this.replace.apply(this, replacement);
        } else {
          this.replace(replacement);
        }
      }
    });

    return recast.print(this.ast);
  }

  resolvePath(filename) {
    if ( !this.dirPath ) {
      return filename;
    }
    return path.join(this.dirPath, filename);
  }
}

module.exports = Rewriter;
