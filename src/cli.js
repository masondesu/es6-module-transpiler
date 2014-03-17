require('../lib/traceur-runtime');

let _ = require('underscore');
let fs = require('fs');
let path = require('path');

let transpile = require('./index').transpile;

let opts = require('nomnom')
  .nocolors()
  .script('es6-module-transpiler')
  .options({
    'path': {
      help: 'Path to source file(s).',
      required: true,
      list: true,
      position: 0
    },
    'dest': {
      help: 'Destination folder for transpiled files.\t[required]',
      metavar: 'FOLDER',
      required: true
    },
    'type': {
      help: 'Transpile target. Either amd, cjs, or yui.\t[required]',
      required: true,
      abbr: 't',
      metavar: 'TYPE',
      choices: ['amd', 'cjs', 'yui']
    },

    'name': {
      help: 'Specify the module\'s name for the global registry, as well as for AMD/YUI named modules. Otherwise, a name inferred from the path (minus the extension) is used for the registry name, and AMD/YUI modules wll be anonymous.',
      metavar: 'NAME'
    },
    'infer-name': {
      help: 'Use the path-inferred name for AMD/YUI module names (not just their registry names).',
      flag: true
    },
    'help': {
      help: 'Show this help.',
      abbr: 'h'
    },
    'version': {
      help: 'Show the current version.',
      abbr: 'v',
      flag: true,
      callback: function() {
        return 'v' + require('../package.json').version;
      }
    }
  })
  .parse();

// Collect files

function processDirectory(dirname) {
  let children = fs.readdirSync(dirname);

  return children.map((child) => processPath(path.join(dirname, child)));
}

function processPath(filename) {
  let stat = fs.statSync(filename);
  if (stat.isDirectory()) {
    return processDirectory(filename);
  }
  return processFile(filename);
}

function processFile(filename) {
  return filename;
}

function inferName(filename) {
  var ext = path.extname(filename);
  return filename.slice(0, filename.length - ext.length);
}

let files = _.flatten(opts.path.map(processPath));

for (let filename of files) {
  let src = fs.readFileSync(filename, 'utf8');

  var inferredName = inferName(filename);
  var output = transpile(src, opts.type, {
    registryName: opts.name || inferredName,
    moduleName: opts['infer-name'] === true ? inferredName : opts.name
  });

  var outPath = path.join(opts.dest, filename);
  require('mkdirp').sync(path.dirname(outPath));
  fs.writeFileSync(outPath, output.code);
}
