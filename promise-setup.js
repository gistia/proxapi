/** configures BlueBird as default promises providers */
global.Promise = require('bluebird');
Promise.config({ longStackTraces: true });
