'use strict';

var winston = require('winston');
const moment = require('moment-timezone')
moment.tz.setDefault("Asia/Singapore");
winston.level=process.env.LOGGER_LEVEL || 'debug';

var logTimestamp=process.env.LOGGER_TIMESTAMP || true;
if (logTimestamp)  {
   winston.remove(winston.transports.Console);
//    winston.add(winston.transports.Console, {'timestamp':true});
    winston.add(winston.transports.Console, {'timestamp': () => {
      // return moment().format('LLL');
      // return moment().format('L LTS.SSS');
      return moment().format('MM/DD/YYYY h:mm:ss.SSS A');
    }, 'colorize':true});

   var logger = new (winston.Logger)({
                   transports: [
                      new winston.transports.Console()
                   ]
                });
}
module.exports = winston;
