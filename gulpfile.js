var gulp = require("gulp");
var browserify = require("browserify");
var source = require('vinyl-source-stream');
var watchify = require("watchify");
var tsify = require("tsify");
var ts = require("gulp-typescript");
var gutil = require("gulp-util");
var uglify = require('gulp-uglify');
var sourcemaps = require('gulp-sourcemaps');
var buffer = require('vinyl-buffer');

var tsProject = ts.createProject("tsserverconfig.json");

var paths = {
    pages:
    [
      'www/**/*.html',
      'www/**/*.ico',
      'www/**/*.png',
      'www/**/*.css',
    ]
};

var watchedBrowserify = watchify(browserify({
    basedir: '.',
    debug: true,
    entries: [
      './www/js/angular-modal-service.min.js',
      './www/js/jsqrcode-combined.min.js',
      './www/js/html5-qrcode.min.js',
      './www/js/hammer.min.js',
      './www/js/hammer-time.min.js',
      './www/js/angular-auto-complete.js',
      './www/js/index.ts',
      './www/configs/routeconfig.js',
      './www/services/broadcast.service.ts',
      './www/services/lightning.service.ts',
      './www/controllers/basemodal.controller.ts',
      './www/controllers/qrdisplay.controller.ts',
      './www/controllers/index.controller.js',
      './www/controllers/home.controller.js',
      './www/controllers/openchannel.controller.js',
      './www/controllers/qrscanner.controller.js',
      './www/controllers/sendpayment.controller.ts',
      './www/controllers/sendquickpay.controller.js',
      './www/controllers/transactions.controller.js',
      './www/controllers/verification.controller.js',
      './www/controllers/createinvoice.controller.ts'
    ],
    cache: {},
    packageCache: {}
})
.plugin(tsify));

function bundle()
{
  return watchedBrowserify
    .external('angular')
    .bundle()
    .pipe(source('bundle.min.js'))
    .pipe(buffer())
    .pipe(sourcemaps.init({loadMaps: true}))
    .pipe(uglify())
    .pipe(sourcemaps.write('./'))
    .pipe(gulp.dest("dist/www"));
}

function resynch()
{
  return gulp.src(paths.pages)
    .pipe(gulp.dest("dist/www"));
}

gulp.task("default", function () {
    return tsProject.src()
      .pipe(tsProject())
      .js.pipe(gulp.dest("dist"));
});

gulp.task("copy-html", resynch);
gulp.watch(paths.pages).on('change', resynch);

gulp.task("www", ["copy-html"], bundle);
watchedBrowserify.on("update", bundle);
watchedBrowserify.on("log", gutil.log);
