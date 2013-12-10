/*
 * grunt-injector
 * https://github.com/klei-dev/grunt-injector
 *
 * Copyright (c) 2013 Joakim Bengtson
 * Licensed under the MIT license.
 */

'use strict';

var path = require('path'),
    fs = require('fs');

module.exports = function(grunt) {

  grunt.registerMultiTask('injector', 'Inject references to files into other files (think scripts and stylesheets into an html file)', function() {
    // Merge task-specific and/or target-specific options with these defaults.
    var options = this.options({
      min: false,
      template: null,
      starttag: '<!-- injector:{{ext}} -->',
      endtag: '<!-- endinjector -->',
      transform: function (filepath) {
        var ext = path.extname(filepath).slice(1);
        if (ext === 'css') {
          return '<link rel="stylesheet" href="' + filepath + '">';
        } else if (ext === 'js') {
          return '<script src="' + filepath + '"></script>';
        } else if (ext === 'html') {
          return '<link rel="import" href="' + filepath + '">';
        }
      }
    });

    if (!options.template) {
      grunt.log.writeln('Missing option `template`, using `dest` as template instead'.grey);
    }

    var tags = {};

    function addFile (basedir, filepath, tagkeyPrefix) {
      var ext = path.extname(filepath).slice(1),
          tagkey = (tagkeyPrefix || '') + ext,
          tag = getTag(tagkey);
      filepath = filepath.replace(/\\/g, '/');
      filepath = makeMinifiedIfNeeded(options.min, filepath);
      if (basedir) {
        filepath = removeBasePath(basedir, filepath);
      }
      filepath = addRootSlash(filepath);
      tag.sources.push({file: filepath, transformed: options.transform(filepath)});
    }

    function getTag (tagkey) {
      var key = options.starttag.replace('{{ext}}', tagkey);
      if (!tags[key]) {
        tags[key] = {
          key: tagkey,
          starttag: key,
          endtag: options.endtag.replace('{{ext}}', tagkey),
          sources: []
        };
      }
      return tags[key];
    }


    // Iterate over all specified file groups.
    this.files.forEach(function(f) {
      var template = options.template || options.destFile || f.dest,
          destination = options.destFile || f.dest;

      if (!grunt.file.exists(template)) {
        grunt.log.error('Could not find template "' + template + '". Injection not possible');
        return false;
      }

      var templateContent = grunt.file.read(template),
          templateOriginal = templateContent;

      f.src.forEach(function(filepath) {
        // Warn on and remove invalid source files.
        if (!grunt.file.exists(filepath)) {
          grunt.log.warn('Source file "' + filepath + '" not found.');
          return;
        }

        if (path.basename(filepath) === 'bower.json') {
          getFilesFromBower(filepath).forEach(function (file) {
            addFile([options.ignorePath, path.dirname(filepath)], file, 'bower:');
          });
        } else {
          addFile(options.ignorePath, filepath);
        }
      });

      Object.keys(tags).forEach(function (key) {
        var tag = tags[key];
        var re = new RegExp('([\t ]*)(' + escapeForRegExp(tag.starttag) + ')(\\n|\\r|.)*?(' + escapeForRegExp(tag.endtag) + ')', 'gi');
        templateContent = templateContent.replace(re, function (match, indent, starttag, content, endtag) {
          grunt.log.writeln('Injecting ' + tag.key.green + ' files ' + ('(' + tag.sources.length + ' files)').grey);
          if (typeof options.sort === 'function') {
            tag.sources.sort(function (a, b) {
              return options.sort(a.file, b.file);
            });
          }
          return indent + starttag  + [''].concat(tag.sources.map(function (s) { return s.transformed; })).concat(['']).join('\n' + indent) + endtag;
        });
      });

      // Write the destination file.
      if (templateContent !== templateOriginal || !grunt.file.exists(destination)) {
        grunt.file.write(destination, templateContent);
      } else {
        grunt.log.ok('Nothing changed');
      }

    });
  });

};

function getFilesFromBower (bowerFile) {
  // Load bower dependencies with `wiredep`:
  var helpers = require('wiredep/lib/helpers'),
      config = helpers.createStore();

  config.set
    ('warnings', [])
    ('global-dependencies', helpers.createStore())
    ('bower.json', JSON.parse(fs.readFileSync(bowerFile, 'utf8')))
    ('directory', path.join(path.dirname(bowerFile), 'bower_components'));

  require('wiredep/lib/detect-dependencies')(config);

  var deps = config.get('global-dependencies-sorted');

  return Object.keys(deps).reduce(function (files, key) {
    return files.concat(deps[key]);
  }, []);
}

function makeMinifiedIfNeeded (doMinify, filepath) {
  if (!doMinify) {
    return filepath;
  }
  var ext = path.extname(filepath);
  var minFile = filepath.slice(0, -ext.length) + '.min' + ext;
  if (fs.existsSync(minFile)) {
    return minFile;
  }
  return filepath;
}

function toArray (arr) {
  if (!Array.isArray(arr)) {
    return [arr];
  }
  return arr;
}

function addRootSlash (filepath) {
  return filepath.replace(/^\/*([^\/])/, '/$1');
}

function removeBasePath (basedir, filepath) {
  return toArray(basedir).reduce(function (path, remove) {
    if (remove && path.indexOf(remove) === 0) {
      return path.slice(remove.length);
    } else {
      return path;
    }
  }, filepath);
}

function escapeForRegExp (str) {
  return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

