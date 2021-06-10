/* Copyright 2016 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* eslint-env node */
/* eslint-disable object-shorthand */
/* globals target */

"use strict";

var autoprefixer = require("autoprefixer");
var calc = require("postcss-calc");
var cssvariables = require("postcss-css-variables");
var fs = require("fs");
var gulp = require("gulp");
var postcss = require("gulp-postcss");
var replace = require("gulp-replace");
var mkdirp = require("mkdirp");
var path = require("path");
var rimraf = require("rimraf");
var stream = require("stream");
var exec = require("child_process").exec;
var merge = require("merge-stream");
var webpack2 = require("webpack");
var webpackStream = require("webpack-stream");
var Vinyl = require("vinyl");
var through = require("through2");

var BUILD_DIR = "build/";
var L10N_DIR = "l10n/";

var GENERIC_DIR = BUILD_DIR + "generic/";
var GENERIC_ES5_DIR = BUILD_DIR + "generic-es5/";
var DEFAULT_PREFERENCES_DIR = BUILD_DIR + "default_preferences/";
var COMMON_WEB_FILES = ["web/images/*.{png,svg,gif,cur}", "web/debugger.js"];
var COMMON_TW_WEB_FILES = [
  "tw-web/css/images/*.{png,svg,gif,cur}",
  "tw-web/debugger.js",
];

var builder = require("./external/builder/builder.js");

var CONFIG_FILE = "pdfjs.config";
var config = JSON.parse(fs.readFileSync(CONFIG_FILE).toString());

// Default Autoprefixer config used for generic, components, minified-pre
var AUTOPREFIXER_CONFIG = {
  overrideBrowserslist: [
    "last 2 versions",
    "Chrome >= 49", // Last supported on Windows XP
    "Firefox >= 52", // Last supported on Windows XP
    "Firefox ESR",
    "IE >= 11",
    "Safari >= 9",
    "> 0.5%",
    "not dead",
  ],
};
var CSS_VARIABLES_CONFIG = {
  preserve: true,
};

const DEFINES = Object.freeze({
  PRODUCTION: true,
  SKIP_BABEL: true,
  TESTING: false,
  // The main build targets:
  GENERIC: false,
  MOZCENTRAL: false,
  CHROME: false,
  MINIFIED: false,
  COMPONENTS: false,
  LIB: false,
  IMAGE_DECODERS: false,
});

function transform(charEncoding, transformFunction) {
  return through.obj(function (vinylFile, enc, done) {
    var transformedFile = vinylFile.clone();
    transformedFile.contents = Buffer.from(
      transformFunction(transformedFile.contents),
      charEncoding
    );
    done(null, transformedFile);
  });
}

function createStringSource(filename, content) {
  var source = stream.Readable({ objectMode: true });
  source._read = function () {
    this.push(
      new Vinyl({
        path: filename,
        contents: Buffer.from(content),
      })
    );
    this.push(null);
  };
  return source;
}

function createWebpackConfig(defines, output) {
  var versionInfo = getVersionJSON();
  var bundleDefines = builder.merge(defines, {
    BUNDLE_VERSION: versionInfo.version,
    BUNDLE_BUILD: versionInfo.commit,
    TESTING: defines.TESTING || process.env.TESTING === "true",
  });
  var licenseHeaderLibre = fs
    .readFileSync("./src/license_header_libre.js")
    .toString();
  var enableSourceMaps =
    !bundleDefines.MOZCENTRAL &&
    !bundleDefines.CHROME &&
    !bundleDefines.TESTING;
  var skipBabel = bundleDefines.SKIP_BABEL;

  // Required to expose e.g., the `window` object.
  output.globalObject = "this";

  return {
    mode: "none",
    output: output,
    performance: {
      hints: false, // Disable messages about larger file sizes.
    },
    plugins: [
      new webpack2.BannerPlugin({ banner: licenseHeaderLibre, raw: true }),
    ],
    resolve: {
      alias: {
        pdfjs: path.join(__dirname, "src"),
        "pdfjs-web": path.join(__dirname, "web"),
        "pdfjs-lib": path.join(__dirname, "web/pdfjs"),
      },
    },
    devtool: enableSourceMaps ? "source-map" : undefined,
    module: {
      rules: [
        {
          loader: "babel-loader",
          // `core-js` (see https://github.com/zloirock/core-js/issues/514),
          // `web-streams-polyfill` (already using a transpiled file), and
          // `src/core/{glyphlist,unicode}.js` (Babel is too slow for those)
          // should be excluded from processing.
          exclude: /(node_modules[\\\/]core-js|node_modules[\\\/]web-streams-polyfill|src[\\\/]core[\\\/](glyphlist|unicode))/,
          options: {
            presets: skipBabel ? undefined : ["@babel/preset-env"],
            plugins: [
              "@babel/plugin-transform-modules-commonjs",
              [
                "@babel/plugin-transform-runtime",
                {
                  helpers: false,
                  regenerator: true,
                },
              ],
            ],
          },
        },
        {
          loader: path.join(__dirname, "external/webpack/pdfjsdev-loader.js"),
          options: {
            rootPath: __dirname,
            saveComments: false,
            defines: bundleDefines,
          },
        },
      ],
    },
    // Avoid shadowing actual Node.js variables with polyfills, by disabling
    // polyfills/mocks - https://webpack.js.org/configuration/node/
    node: false,
  };
}

function createWebpackConfig2(defines, output) {
  var versionInfo = getVersionJSON();
  var bundleDefines = builder.merge(defines, {
    BUNDLE_VERSION: versionInfo.version,
    BUNDLE_BUILD: versionInfo.commit,
    TESTING: defines.TESTING || process.env.TESTING === "true",
  });
  var licenseHeaderLibre = fs
    .readFileSync("./src/license_header_libre.js")
    .toString();
  var enableSourceMaps =
    !bundleDefines.MOZCENTRAL &&
    !bundleDefines.CHROME &&
    !bundleDefines.TESTING;
  var skipBabel = bundleDefines.SKIP_BABEL;

  // Required to expose e.g., the `window` object.
  output.globalObject = "this";

  return {
    mode: "none",
    output: output,
    performance: {
      hints: false, // Disable messages about larger file sizes.
    },
    plugins: [
      new webpack2.BannerPlugin({ banner: licenseHeaderLibre, raw: true }),
    ],
    resolve: {
      alias: {
        pdfjs: path.join(__dirname, "src"),
        "pdfjs-web": path.join(__dirname, "tw-web"),
        "pdfjs-lib": path.join(__dirname, "tw-web/pdfjs"),
      },
    },
    devtool: enableSourceMaps ? "source-map" : undefined,
    module: {
      rules: [
        {
          loader: "babel-loader",
          // `core-js` (see https://github.com/zloirock/core-js/issues/514),
          // `web-streams-polyfill` (already using a transpiled file), and
          // `src/core/{glyphlist,unicode}.js` (Babel is too slow for those)
          // should be excluded from processing.
          exclude: /(node_modules[\\\/]core-js|node_modules[\\\/]web-streams-polyfill|src[\\\/]core[\\\/](glyphlist|unicode))/,
          options: {
            presets: skipBabel ? undefined : ["@babel/preset-env"],
            plugins: [
              "@babel/plugin-transform-modules-commonjs",
              [
                "@babel/plugin-transform-runtime",
                {
                  helpers: false,
                  regenerator: true,
                },
              ],
            ],
          },
        },
        {
          loader: path.join(__dirname, "external/webpack/pdfjsdev-loader.js"),
          options: {
            rootPath: __dirname,
            saveComments: false,
            defines: bundleDefines,
          },
        },
      ],
    },
    // Avoid shadowing actual Node.js variables with polyfills, by disabling
    // polyfills/mocks - https://webpack.js.org/configuration/node/
    node: false,
  };
}

function webpack2Stream(webpackConfig) {
  // Replacing webpack1 to webpack2 in the webpack-stream.
  return webpackStream(webpackConfig, webpack2);
}

function getVersionJSON() {
  return JSON.parse(fs.readFileSync(BUILD_DIR + "version.json").toString());
}

function replaceWebpackRequire() {
  // Produced bundles can be rebundled again, avoid collisions (e.g. in api.js)
  // by renaming  __webpack_require__ to something else.
  return replace("__webpack_require__", "__w_pdfjs_require__");
}

function replaceJSRootName(amdName, jsName) {
  // Saving old-style JS module name.
  return replace(
    'root["' + amdName + '"] = factory()',
    'root["' + amdName + '"] = root.' + jsName + " = factory()"
  );
}

function createMainBundle(defines) {
  var mainAMDName = "pdfjs-dist/build/pdf";
  var mainOutputName = "pdf.js";

  var mainFileConfig = createWebpackConfig(defines, {
    filename: mainOutputName,
    library: mainAMDName,
    libraryTarget: "umd",
    umdNamedDefine: true,
  });
  return gulp
    .src("./src/pdf.js")
    .pipe(webpack2Stream(mainFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceJSRootName(mainAMDName, "pdfjsLib"));
}

function createMainBundle2(defines) {
  var mainAMDName = "pdfjs-dist/build/pdf";
  var mainOutputName = "pdf.js";

  var mainFileConfig = createWebpackConfig2(defines, {
    filename: mainOutputName,
    library: mainAMDName,
    libraryTarget: "umd",
    umdNamedDefine: true,
  });
  return gulp
    .src("./src/pdf.js")
    .pipe(webpack2Stream(mainFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceJSRootName(mainAMDName, "pdfjsLib"));
}

function createWorkerBundle(defines) {
  var workerAMDName = "pdfjs-dist/build/pdf.worker";
  var workerOutputName = "pdf.worker.js";

  var workerFileConfig = createWebpackConfig(defines, {
    filename: workerOutputName,
    library: workerAMDName,
    libraryTarget: "umd",
    umdNamedDefine: true,
  });
  return gulp
    .src("./src/pdf.worker.js")
    .pipe(webpack2Stream(workerFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceJSRootName(workerAMDName, "pdfjsWorker"));
}

function createWebBundle(defines) {
  var viewerOutputName = "viewer.js";

  var viewerFileConfig = createWebpackConfig(defines, {
    filename: viewerOutputName,
  });
  return gulp.src("./web/viewer.js").pipe(webpack2Stream(viewerFileConfig));
}

function createWebBundle2(defines) {
  var viewerOutputName = "tw_viewer.js";
  var viewerFileConfig = createWebpackConfig(defines, {
    filename: viewerOutputName,
  });
  return gulp
    .src("./tw-web/tw_viewer.js")
    .pipe(webpack2Stream(viewerFileConfig));
}

function checkFile(filePath) {
  try {
    var stat = fs.lstatSync(filePath);
    return stat.isFile();
  } catch (e) {
    return false;
  }
}

function checkDir(dirPath) {
  try {
    var stat = fs.lstatSync(dirPath);
    return stat.isDirectory();
  } catch (e) {
    return false;
  }
}

function getTempFile(prefix, suffix) {
  mkdirp.sync(BUILD_DIR + "tmp/");
  var bytes = require("crypto").randomBytes(6).toString("hex");
  var filePath = BUILD_DIR + "tmp/" + prefix + bytes + suffix;
  fs.writeFileSync(filePath, "");
  return filePath;
}

gulp.task("default", function (done) {
  console.log("Available tasks:");
  var tasks = Object.keys(gulp.registry().tasks());
  tasks.sort();
  tasks.forEach(function (taskName) {
    console.log("  " + taskName);
  });
  done();
});

gulp.task("buildnumber", function (done) {
  console.log();
  console.log("### Getting extension build number");

  exec("git log --format=oneline " + config.baseVersion + "..", function (
    err,
    stdout,
    stderr
  ) {
    var buildNumber = 0;
    if (!err) {
      // Build number is the number of commits since base version
      buildNumber = stdout ? stdout.match(/\n/g).length : 0;
    } else {
      console.log("This is not a Git repository; using default build number.");
    }

    console.log("Extension build number: " + buildNumber);

    var version = config.versionPrefix + buildNumber;

    exec('git log --format="%h" -n 1', function (err2, stdout2, stderr2) {
      var buildCommit = "";
      if (!err2) {
        buildCommit = stdout2.replace("\n", "");
      }

      createStringSource(
        "version.json",
        JSON.stringify(
          {
            version: version,
            build: buildNumber,
            commit: buildCommit,
          },
          null,
          2
        )
      )
        .pipe(gulp.dest(BUILD_DIR))
        .on("end", done);
    });
  });
});

gulp.task("default_preferences-pre", function () {
  console.log();
  console.log("### Building `default_preferences.json`");

  // Refer to the comment in the 'lib' task below.
  function babelPluginReplaceNonWebPackRequire(babel) {
    return {
      visitor: {
        Identifier(curPath, state) {
          if (curPath.node.name === "__non_webpack_require__") {
            curPath.replaceWith(babel.types.identifier("require"));
          }
        },
      },
    };
  }
  function preprocess(content) {
    content = preprocessor2.preprocessPDFJSCode(ctx, content);
    return babel.transform(content, {
      sourceType: "module",
      presets: undefined, // SKIP_BABEL
      plugins: [
        "@babel/plugin-transform-modules-commonjs",
        babelPluginReplaceNonWebPackRequire,
      ],
    }).code;
  }
  var babel = require("@babel/core");
  var ctx = {
    rootPath: __dirname,
    saveComments: false,
    defines: builder.merge(DEFINES, {
      GENERIC: true,
      LIB: true,
      BUNDLE_VERSION: 0, // Dummy version
      BUNDLE_BUILD: 0, // Dummy build
    }),
    map: {
      "pdfjs-lib": "../pdf",
    },
  };
  var preprocessor2 = require("./external/builder/preprocessor2.js");
  return merge([
    gulp.src(["web/{app_options,viewer_compatibility}.js"], {
      base: ".",
    }),
  ])
    .pipe(transform("utf8", preprocess))
    .pipe(gulp.dest(DEFAULT_PREFERENCES_DIR + "lib/"));
});

gulp.task(
  "default_preferences",
  gulp.series("default_preferences-pre", function (done) {
    var AppOptionsLib = require("./" +
      DEFAULT_PREFERENCES_DIR +
      "lib/web/app_options.js");
    var AppOptions = AppOptionsLib.AppOptions;
    var OptionKind = AppOptionsLib.OptionKind;

    createStringSource(
      "default_preferences.json",
      JSON.stringify(AppOptions.getAll(OptionKind.PREFERENCE), null, 2)
    )
      .pipe(gulp.dest(BUILD_DIR))
      .on("end", done);
  })
);

gulp.task("locale", function () {
  var VIEWER_LOCALE_OUTPUT = "web/locale/";

  console.log();
  console.log("### Building localization files");

  rimraf.sync(VIEWER_LOCALE_OUTPUT);
  mkdirp.sync(VIEWER_LOCALE_OUTPUT);

  var subfolders = fs.readdirSync(L10N_DIR);
  subfolders.sort();
  var viewerOutput = "";
  var locales = [];
  for (var i = 0; i < subfolders.length; i++) {
    var locale = subfolders[i];
    var dirPath = L10N_DIR + locale;
    if (!checkDir(dirPath)) {
      continue;
    }
    if (!/^[a-z][a-z]([a-z])?(-[A-Z][A-Z])?$/.test(locale)) {
      console.log("Skipping invalid locale: " + locale);
      continue;
    }

    mkdirp.sync(VIEWER_LOCALE_OUTPUT + "/" + locale);

    locales.push(locale);

    if (checkFile(dirPath + "/viewer.properties")) {
      viewerOutput +=
        "[" +
        locale +
        "]\n" +
        "@import url(" +
        locale +
        "/viewer.properties)\n\n";
    }
  }

  return merge([
    createStringSource("locale.properties", viewerOutput).pipe(
      gulp.dest(VIEWER_LOCALE_OUTPUT)
    ),
    gulp
      .src(L10N_DIR + "/{" + locales.join(",") + "}/viewer.properties", {
        base: L10N_DIR,
      })
      .pipe(gulp.dest(VIEWER_LOCALE_OUTPUT)),
  ]);
});

function preprocessCSS(source, mode, defines, cleanup) {
  var outName = getTempFile("~preprocess", ".css");
  builder.preprocessCSS(mode, source, outName);
  var out = fs.readFileSync(outName).toString();
  fs.unlinkSync(outName);
  if (cleanup) {
    // Strip out all license headers in the middle.
    var reg = /\n\/\* Copyright(.|\n)*?Mozilla Foundation(.|\n)*?\*\//g;
    out = out.replace(reg, "");
  }

  var i = source.lastIndexOf("/");
  return createStringSource(source.substr(i + 1), out);
}

function preprocessHTML(source, defines) {
  var outName = getTempFile("~preprocess", ".html");
  builder.preprocess(source, outName, defines);
  var out = fs.readFileSync(outName).toString();
  fs.unlinkSync(outName);

  var i = source.lastIndexOf("/");
  return createStringSource(source.substr(i + 1), out);
}

function buildGeneric(defines, dir) {
  rimraf.sync(dir);

  return merge([
    createMainBundle(defines).pipe(gulp.dest(dir + "build")),
    createMainBundle2(defines).pipe(gulp.dest(dir + "build")),
    createWorkerBundle(defines).pipe(gulp.dest(dir + "build")),
    createWebBundle(defines).pipe(gulp.dest(dir + "web")),
    createWebBundle2(defines).pipe(gulp.dest(dir + "tw-web")),
    gulp.src(COMMON_WEB_FILES, { base: "web/" }).pipe(gulp.dest(dir + "web")),
    gulp
      .src("tw-web/css/*", { base: "tw-web/" })
      .pipe(gulp.dest(dir + "tw-web")),
    gulp
      .src("tw-web/css/images/light/*", { base: "tw-web/css/images/" })
      .pipe(gulp.dest(dir + "tw-web/css/images")),
    gulp
      .src(COMMON_WEB_FILES, { base: "tw-web/" })
      .pipe(gulp.dest(dir + "tw-web")),
    gulp.src("LICENSE").pipe(gulp.dest(dir)),
    gulp
      .src(["web/locale/*/viewer.properties", "web/locale/locale.properties"], {
        base: "web/",
      })
      .pipe(gulp.dest(dir + "web")),
    gulp
      .src(["external/bcmaps/*.bcmap", "external/bcmaps/LICENSE"], {
        base: "external/bcmaps",
      })
      .pipe(gulp.dest(dir + "web/cmaps")),
    preprocessHTML("web/viewer.html", defines).pipe(gulp.dest(dir + "web")),
    preprocessHTML("tw-web/viewer.html", defines).pipe(
      gulp.dest(dir + "tw-web")
    ),

    preprocessCSS("web/viewer.css", "generic", defines, true)
      .pipe(
        postcss([
          cssvariables(CSS_VARIABLES_CONFIG),
          calc(),
          autoprefixer(AUTOPREFIXER_CONFIG),
        ])
      )
      .pipe(gulp.dest(dir + "web")),
    gulp
      .src("web/compressed.tracemonkey-pldi-09.pdf")
      .pipe(gulp.dest(dir + "web")),
  ]);
}

// Builds the generic production viewer that is only compatible with up-to-date
// HTML5 browsers, which implement modern ECMAScript features.
gulp.task(
  "generic",
  gulp.series("buildnumber", "default_preferences", "locale", function () {
    console.log();
    console.log("### Creating generic viewer");
    var defines = builder.merge(DEFINES, { GENERIC: true });

    return buildGeneric(defines, GENERIC_DIR);
  })
);

// Builds the generic production viewer that should be compatible with most
// older HTML5 browsers.
gulp.task(
  "generic-es5",
  gulp.series("buildnumber", "default_preferences", "locale", function () {
    console.log();
    console.log("### Creating generic (ES5) viewer");
    var defines = builder.merge(DEFINES, { GENERIC: true, SKIP_BABEL: false });

    return buildGeneric(defines, GENERIC_ES5_DIR);
  })
);

gulp.task("server", function () {
  console.log();
  console.log("### Starting local server");

  var WebServer = require("./test/webserver.js").WebServer;
  var server = new WebServer();
  server.port = 8888;
  server.start();
});

gulp.task("clean", function (done) {
  console.log();
  console.log("### Cleaning up project builds");

  rimraf(BUILD_DIR, done);
});
