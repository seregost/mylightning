'use strict';

const express = require("express");
const https = require('https');
const fs = require('fs');
const config = require('config');
const Lightning = require("./lightning/"+config.get("lightning-node"));
const session = require('express-session');
const LevelStore = require('express-session-level')(session);
const bodyParser = require('body-parser');
const cookieParser  = require('cookie-parser');
const lightningmodule = require("./lightning/"+config.get("lightning-node"));
const passport = require('passport');
const localStrategy = require('passport-local').Strategy;
const logger = require("./logger");
const qr = require('qr-image');
const UserManager = require('./utilities/usermanager.js');
const levelup = require('levelup')
const leveldown = require('leveldown')
const WebSocket = require('ws');

// Initialize levelDB storage
var db = levelup(leveldown('./mydb'))

var userManager = new UserManager("users")
var lightningnodes = {};

// Start lightning daemons.
userManager.each((userid, user) => {
  var rpcport = user.rpcport;
  var peerport = user.peerport;
  if(rpcport != null) {
    logger.info(userid, "Started listener on port " + rpcport);
    lightningnodes[userid] = new Lightning(userid, rpcport, peerport);
  }
});

passport.use(new localStrategy(
  function(username, password, done) {
    process.nextTick(function() {
      var user = userManager.getuser(username)

      if(!user) {
        logger.error(username, "Login attempt for invalid user.");
        return done(null, false);
      }
      else if(!user.password) {
        return userManager.updatepassword(username, password, (user) => {
          if(user == null) {
            logger.error(username, "Failed first time login.")
            done(null, false);
          }
          else {
            logger.verbose(username, "Successful first time login.");
            return done(null, user);
          }
        });
      }
      else {
        return userManager.verifypassword(user, password, (success,user) => {
          if(success == true) {
            logger.verbose(username, "Valid login for user.");
            return done(null, user);
          }
          else {
            logger.error(username, "Invalid password login attempt.");
            return done(null, false);
          }
        });
      }
    });
  }
));

passport.serializeUser(function(user, cb) {
  logger.silly(user.id, "Serializing user to session.");
  cb(null, user);
});

passport.deserializeUser(function(obj, cb) {
  logger.silly("Attempting to load user from session.")
  cb(null, obj);
});

var app = express();

logger.info("Configuring express");
const sessionParser = session({
  secret: 'ieowieow',
  store: new LevelStore(db),
  resave: true,
  saveUninitialized: true,
  cookie: { secure: true }
})

app
  .use(bodyParser.json()) // support json encoded bodies
  .use(bodyParser.urlencoded({ extended: true })) // support encoded bodies
  .use(cookieParser('htuayreve'))
  .use(sessionParser)
  .use(passport.initialize())
  .use(passport.session());

app.get('/login', function(req, res){
  res.sendfile("./server/views/login.html");
  });

app.post('/login',
  passport.authenticate('local'),
  function(req, res) {
    if(req.user != null) {
      logger.info(req.user.id, "Successfully authenticated.")
    }
    else {
      logger.error("Unauthorized login attempt with invalid password.")
    }
    // do something with req.user
    res.sendStatus(req.user ? 200 : 401);
  });

// TODO: Do some QoS control on this to avoid spam?
app.post('/rest/v1/requestinvoice', function (req, res) {
  try {
    var pub_key = req.body.pub_key;

    var lightningnode = null;
    var keys = Object.keys(lightningnodes);
    for(var i=0;i<keys.length;i++){
        var userid = keys[i];
        if(lightningnodes[userid].pubkey == pub_key)
          lightningnode = lightningnodes[userid];
    }
    var memo = req.body.memo;
    var amount = req.body.amount;

    if(lightningnode == null)
    {
      // No record of a user with the given pubkey.
      logger.error(userid, "/rest/v1/requestinvoice failed.  No lightning node.")
      res.sendStatus(404);
    }
    else {
      lightningnode.createinvoice(memo, amount, false, (response) => {
        logger.verbose(userid, "/rest/v1/requestinvoice succeeded.")
        logger.debug(userid, JSON.stringify(response));
        res.send(response);
      });
    }
  } catch (e) {
    logger.error(userid, "Exception occurred in /rest/v1/requestinvoice: " + e.message);
    res.sendStatus(500);
  }
})

// Blanketly require authentication beyond this point before using any other resources.
app.use('*', function(req, res, next) {
  logger.silly("Attempting session authorization.")
  if(req.isAuthenticated())
  {
    if(userManager.getuser(req.user.id).rpcport == null) {
      // Redirect to new account if ports aren't set up.
      res.redirect('/newaccount')
    }
    else
      next();
  }
  else {
    // Attempt token authentication for the rest api
    if(req.baseUrl.includes('rest/v1')) {
      res.sendStatus(401);
    }
    else
    {
      res.redirect('/login')
    }
  }
});

logger.info("Configured authentication routes");

// Allow static access to views.
app.use(express.static(__dirname + '/server'));

// Accessed to mobile app package.
// TODO: Should this be cloud stored?
// Google Play will solve the problem.
app.get('/mobileapp', function(req, res){
  res.sendfile("./mobileapp/mylightning.apk");
});

app.get('/rest/v1/ping', function (req, res) {
  res.sendStatus(200);
});

// Logout of user session.
app.post('/rest/v1/logout', function (req, res) {
  logger.info(req.user.id, "Successful logout.");
  req.session.destroy();
});

// Rest API
app.post('/rest/v1/sendinvoice', function (req, res) {
  try {
    var userid = req.user.id;
    var invoiceid = req.body.invoiceid;
    var alias = req.body.alias;

    lightningnodes[userid].sendinvoice(invoiceid, alias, (response) => {
      logger.verbose(userid, "/rest/v1/sendinvoice succeeded.")
      logger.debug(userid, "Response:" + JSON.stringify(response));

      res.send(response);
    });
  } catch (e) {
    logger.error(userid, "Exception occurred in /rest/v1/sendinvoice: " + e.message);
    res.sendStatus(500);
  }
})

app.post('/rest/v1/quickpay', function (req, res) {
  try {
    var userid = req.user.id;
    var dest = req.body.dest;
    var amount = req.body.amount;
    var memo = req.body.memo;

    lightningnodes[userid].quickpay(dest, amount, memo, (response) => {
      logger.verbose(userid, "/rest/v1/quickpay succeeded")
      logger.debug(userid, "Response:" + JSON.stringify(response));

      res.send(response);
  });
  } catch (e) {
    logger.error(userid, "Exception occurred in /rest/v1/quickpay: " + e.message);
    res.sendStatus(500);
  }
})

app.post('/rest/v1/createinvoice', function (req, res) {
  try {
    var userid = req.user.id;
    var memo = req.body.memo;
    var amount = req.body.amount;
    var quickpay = req.body.quickpay;

    lightningnodes[userid].createinvoice(memo, amount, quickpay, (response) => {
      logger.verbose(userid, "/rest/v1/createinvoice succeeded.")
      logger.debug(userid, "Response:" + JSON.stringify(response));
      res.send(response);
    });
  } catch (e) {
    logger.error(userid, "Exception occurred in /rest/v1/quickpay: " + e.message);
    res.sendStatus(500);
  }
})

app.post('/rest/v1/openchannel', function (req, res) {
  try {
    var userid = req.user.id;
    var remotenode = req.body.remotenode;
    var amount = req.body.amount;

    lightningnodes[userid].openchannel(remotenode, amount, (response) => {
      logger.verbose(userid, "/rest/v1/openchannel succeeded.")
      logger.debug(userid, "Response:" + JSON.stringify(response));
      res.send(response);
    });
  } catch (e) {
    logger.error(userid, "Exception occurred in /rest/v1/openchannel: " + e.message);
    res.sendStatus(500);
  }
})

app.post('/rest/v1/closechannel', function (req, res) {
  try {
    var userid = req.user.id;
    var channelpoint = req.body.channelpoint;

    lightningnodes[userid].closechannel(channelpoint, (response) => {
      logger.verbose(userid, "/rest/v1/closechannel succeeded.")
      logger.debug(userid, "Response:" + JSON.stringify(response));
      res.send(response);
    });
  } catch (e) {
    logger.error(userid, "Exception occurred in /rest/v1/closechannel: " + e.message);
    res.sendStatus(500);
  }
})

app.get('/rest/v1/getinvoiceqr', function (req, res) {
  try {
    var userid = req.user.id;
    var easypay = req.query.easypay;

    if(easypay == null) {
      fs.readFile('./db/'+req.user.id+'/latestinvoice.png', function (err, data) {
        if (err) throw err;
        logger.verbose(userid, "/rest/v1/getinvoiceqr (none quickpay) succeeded")
        res.contentType("image/png");
        res.send(data);
      });
    }
    else {
      fs.readFile('./db/'+req.user.id+'/latestinvoice_easy.png', function (err, data) {
        if (err) throw err;
        logger.verbose(userid, "/rest/v1/getinvoiceqr (quickpay) succeeded")
        res.contentType("image/png");
        res.send(data);
      });
    }
  }
  catch (e) {
    logger.error(userid, "Exception occurred in /rest/v1/getinvoiceqr: " + e.message);
    res.sendStatus(500);
  }
})

app.get('/rest/v1/getqrimage', function (req, res) {
  try {
    var userid = req.user.id;
    var inputcode = req.query.inputcode;

    var data = qr.imageSync(inputcode, { type: 'png' });

    res.contentType("image/png");
    res.send(data);
  }
  catch (e) {
    logger.error(userid, "Exception occurred in /rest/v1/getinvoiceqr: " + e.message);
    res.sendStatus(500);
  }
})

/**
* Get all quick data for a user in one go.
*/
app.get('/rest/v1/getalldata', function (req, res) {
  try {
    var datapackage = {user: req.user};

    var dir = './db/'+req.user.id+'/';
    readjson(dir+'address.json').then((data) => {
      datapackage.address = data;
      return readjson(dir+'info.json');
    }).then((data) => {
      datapackage.info = data;
      return readjson(dir+'balances.json');
    }).then((data) => {
      datapackage.balances = data;
      return readjson(dir+'channels.json');
    }).then((data) => {
      datapackage.channels = data;
      return readjson(dir+'quickpaynodes.json');
    }).then((data) => {
      datapackage.quickpaynodes = data;
      return readjson(dir+'transactions.json');
    }).then((data) => {
      datapackage.transactions = data;
      res.send(datapackage);
    }).catch((error) => {
      logger.error(req.user.id, "Exception occurred in /rest/v1/getalldata: " + error);
      res.sendStatus(500);
    });
  } catch(e) {
    logger.error(req.user.id, "Exception occurred in /rest/v1/getalldata: " + e.message);
    res.sendStatus(500);
  }
})

app.get('*', function(req, res){
  res.sendStatus(404);
});

function readjson(path)
{
  return new Promise((resolve, reject) => {
    if(!fs.existsSync(path)) {
      logger.debug("Tried to fetch a file that doesn't exist: " + path);
      resolve(JSON.parse("{}"));
    }
    else {
      fs.readFile(path, 'utf8', function (err, data) {
        if (err) reject(err);

        if(data.length == 0)
          data = "{}";

        resolve(JSON.parse(data));
      });
    }
  });
}

logger.info("Configured REST routes");

// Initialize SSL settings
var sslOptions = {
  key: fs.readFileSync('./certs/key.pem'),
  cert: fs.readFileSync('./certs/cert.pem')
};

var httpsServer = https.createServer(sslOptions, app).listen(config.get("webport"));
logger.info("Started express server on port "+config.get("webport"));

// Create an instance of websocket server.
var wss = new WebSocket.Server({
  verifyClient: (info, done) => {
    sessionParser(info.req, {}, () => {
      if(info.req.session.passport == null) {
        logger.error("Login attempt with invalid session.")
        done(false);
      }
      else {
        done(info.req.session);
      }
    });
  },
  server: httpsServer
});
logger.info("New websocket server created and awaiting connections.");

wss.on('connection', (ws) => {
  var userid = null;

  var id = setInterval(() => {
    try {
      if(userid != null) {
        var lightning = lightningnodes[userid]

        var newtransactions = lightning.newtransactions();
        if(newtransactions.length > 0)
        {
          var message = {"method": "newtransactions", "params": newtransactions};
          ws.send(JSON.stringify(message));
          logger.silly(userid, "New transactions sent.");
        }

        var newchannels = lightning.newchannels();
        if(newchannels.length > 0)
        {
          var message = {"method": "newchannels", "params": newchannels};
          ws.send(JSON.stringify(message));
          logger.silly(userid, "New channels sent.");
        }

        if(lightning.shouldupdate() == true)
        {
          var message = {"method": "refresh", "params": []};
          ws.send(JSON.stringify(message));
          logger.silly(userid, "New refresh sent.");
        }
      }
    }
    catch (e) {
      logger.error(userid, "Refresh cycle failed with error: " + e.message);
    }
  }, 1000);

  ws.on('message', (message) => {
    // TODO: This is a minor security problem because people could
    // spoof user id and recieve updates for others.  Need to figure out
    // how to get the session information passed to the web socket connect event.
    logger.debug(message, "UserID recieved.");
    userid = message;
  });

  ws.on('close', function () {
    logger.debug(userid, 'Stopping client connection.');
    clearInterval(id);
  });
});
