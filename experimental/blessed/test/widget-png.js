var blessed = require('../');
var fs = require('fs');

var argv = {};

process.argv = process.argv.map(function(arg, i) {
  if (/^--\w+=/.test(arg)) {
    arg = arg.split('=');
    if (/^[0-9.]+$/.test(arg[1])) arg[1] = +arg[1];
    argv[arg[0].replace(/^--/, '')] = arg[1];
    return;
  }
  if (arg.indexOf('--') === 0) {
    arg = arg.slice(2);
    argv[arg] = true;
    return;
  }
  return arg;
}).filter(Boolean);

var screen = blessed.screen({
  tput: true,
  smartCSR: true,
  dump: __dirname + '/logs/png.log',
  warnings: true
});

var box1 = blessed.box({
  parent: screen,
  left: 4,
  top: 3,
  width: 10,
  height: 6,
  border: 'line',
  style: {
    bg: 'green'
  },
  content: fs.readFileSync(__dirname + '/lorem.txt', 'utf8')
});

var box2 = blessed.box({
  parent: screen,
  left: 20,
  top: 8,
  width: 40,
  height: 15,
  border: 'line',
  style: {
    bg: 'green'
  },
  content: fs.readFileSync(__dirname + '/lorem.txt', 'utf8')
});

var file = process.argv[2];
var testImage = __dirname + '/test-image.png';
var spinfox = __dirname + '/spinfox.png';

// XXX I'm not sure of the license of this file,
// so I'm not going to redistribute it in the repo.
var url = 'https://people.mozilla.org/~dolske/apng/spinfox.png';

if (!file) {
  try {
    if (!fs.existsSync(spinfox)) {
      var buf = blessed.ansiimage.curl(url);
      fs.writeFileSync(spinfox, buf);
    }
    file = spinfox;
  } catch (e) {
    file = testImage;
  }
}

if (!argv.width && !argv.height && !argv.scale) {
  argv.width = 20;
}

var png = blessed.image({
  parent: screen,
  // border: 'line',
  width: argv.width,
  height: argv.height,
  top: 2,
  left: 0,
  file: file,
  draggable: true,
  type: 'ansi',
  scale: argv.scale,
  ascii: argv.ascii,
  optimization: argv.optimization,
  speed: argv.speed
});

screen.render();

screen.key('q', function() {
  clearInterval(timeout);
  screen.destroy();
});

var timeout = setInterval(function() {
  if (png.right <= 0) {
    clearInterval(timeout);
    return;
  }
  png.left++;
  screen.render();
}, 100);

if (timeout.unref) timeout.unref();

screen.key(['h', 'left'], function() {
  png.left -= 2;
});

screen.key(['k', 'up'], function() {
  png.top -= 2;
});

screen.key(['l', 'right'], function() {
  png.left += 2;
});

screen.key(['j', 'down'], function() {
  png.top += 2;
});

screen.on('keypress', function() {
  clearInterval(timeout);
});

png.on('mousedown', function() {
  clearInterval(timeout);
});
