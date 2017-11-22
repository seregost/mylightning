'use strict';

const express = require("express");
const https = require('https');
const fs = require('fs');
const signaljrs = require('signalrjs');
const config = require('config');
const Lightning = require("./lightning/"+config.get("lightning-node"));
const session = require('express-session');
const bodyParser = require('body-parser');
const cookieParser  = require('cookie-parser');
const lightningmodule = require("./lightning/"+config.get("lightning-node"));
const passport = require('passport');
const googleStrategy = require('passport-google-oauth20').Strategy;
const googleTokenStrategy = require('passport-google-id-token');
const logger = require("./logger");
const qr = require('qr-image');
const UserManager = require('./utilities/usermanager.js');

var userManager = new UserManager("users")
var lightningnodes = {};

userManager.each((userid, user) => {
  var rpcport = user.rpcport;
  var peerport = user.peerport;
  logger.info(userid, "Started listener on behalf of '" + user.displayName + "' on port " + rpcport);
  lightningnodes[userid] = new Lightning(userid, rpcport, peerport);
});


// Add new user.
function addUser (userid, sourceUser) {
  var user;
  if(usersById[userid] == null) {
    user = usersById[userid] = {id: userid, displayName: sourceUser.displayName};
    fs.writeFileSync('./db/users.json', JSON.stringify(usersById))
    logger.info(userid, "New user added to system.");
  }
  return usersById[userid];
}

passport.use(new googleStrategy({
    clientID: "173191518858-6ublcr56m3eclo1lfu2p68qfp8otd58s.apps.googleusercontent.com",
    clientSecret: "5iMWu0ZvP18gV8V4YrQRyr34",
    callbackURL: "https://seregost.com:8443/auth/google/callback"
  },
  function(accessToken, refreshToken, profile, cb) {
    logger.info(profile.id, "Google login attempt for profile: " + profile.displayName);
    var user = userManager.adduser(profile.id, profile);
    return cb(null, user);
  }
));

passport.use(new googleTokenStrategy({
    clientID: "173191518858-6ublcr56m3eclo1lfu2p68qfp8otd58s.apps.googleusercontent.com"
  },
  function(parsedToken, googleId, done) {
    logger.info(googleId, "Google token authentication for user id: " + googleId);
    var user = userManager.getuser(googleId);
    return done(null, user);
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
var signalR = signaljrs();

logger.info("Configuring express");
app
  .use(bodyParser.json()) // support json encoded bodies
  .use(bodyParser.urlencoded({ extended: true })) // support encoded bodies
  .use(cookieParser('htuayreve'));

app.use(session({
  secret: 'keyboard cat',
  resave: true,
  saveUninitialized: true,
  cookie: { secure: true }
}));

// Initialize Passport and restore authentication state, if any, from the
// session.
app.use(passport.initialize());
app.use(passport.session());

// Initialize Signal R
app.use(signalR.createListener());

// Add google auth handlers.
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile'] }));

app.post('/auth/google',
  passport.authenticate('google-id-token'),
  function (req, res) {
    if(req.user != null) {
      logger.info(req.user.id, "Successfully authenticated.")
    }
    else {
      logger.error("Unauthorized login attempt with invalid token id.")
    }
    // do something with req.user
    res.sendStatus(req.user ? 200 : 401);
});

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/');
});

// TODO: Possibly due some QoS on this to avoid spam?
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

// Blanketly require authentication before using any other resources.
app.use('*', function(req, res, next) {
  logger.silly("Attempting session authorization.")
  if(req.isAuthenticated())
  {
    if(userManager.getuser(req.user.id).rpcport == null) {
      res.sendStatus(401);
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
      res.redirect('/auth/google')
    }
  }
});

logger.info("Configured authentication routes");

// Allow static access to views.
app.use(express.static(__dirname + '/server'));

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

///////////////
// Data Services.

/**
* Get all quick data for a user in one go.
*/
app.get('/rest/v1/getalldata', function (req, res) {
  try {
    var datapackage = {user: req.user};

    var dir = './db/'+req.user.id+'/';
    readjson(dir+'address.json').then((data) => {
      datapackage.address = JSON.parse(data);
      return readjson(dir+'info.json');
    }).then((data) => {
      datapackage.info = JSON.parse(data);
      return readjson(dir+'balances.json');
    }).then((data) => {
      datapackage.balances = JSON.parse(data);
      return readjson(dir+'channels.json');
    }).then((data) => {
      datapackage.channels = JSON.parse(data);
      return readjson(dir+'quickpaynodes.json');
    }).then((data) => {
      datapackage.quickpaynodes = JSON.parse(data);
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

app.get('/rest/v1/user', function (req, res) {
  res.send(req.user);
})

app.get('/rest/v1/address', function (req, res) {
  fs.readFile('./db/'+req.user.id+'/address.json', 'utf8', function (err, data) {
    if (err) throw err;
    res.send(JSON.parse(data));
  });
})

app.get('/rest/v1/info', function (req, res) {
  fs.readFile('./db/'+req.user.id+'/info.json', 'utf8', function (err, data) {
    if (err) throw err;
    res.send(data);
  });
})

app.get('/rest/v1/balances', function (req, res) {
  fs.readFile('./db/'+req.user.id+'/balances.json', 'utf8', function (err, data) {
    if (err) throw err;
    res.send(data);
  });
})

app.get('/rest/v1/channels', function (req, res) {
  fs.readFile('./db/'+req.user.id+'/channels.json', 'utf8', function (err, data) {
    if (err) throw err;
    res.send(data);
  });
})

app.get('/rest/v1/quickpaynodes', function (req, res) {
  if(!fs.existsSync('./db/'+req.user.id+'/quickpaynodes.json'))
  {
    res.send("{}");
  }
  else
  {
    fs.readFile('./db/'+req.user.id+'/quickpaynodes.json', 'utf8', function (err, data) {
      if (err) throw err;
      res.send(data);
    });
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
      resolve(null);
    }
    else {
      fs.readFile(path, 'utf8', function (err, data) {
        if (err) reject(err);
        resolve(data);
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
https.createServer(sslOptions, app).listen(8443)
logger.info("Started express server on port 8443");

signalR.on('CONNECTED',function(){
    logger.info("New client connection detected.");
    setInterval(function () {
      try {
        var keys = Object.keys(lightningnodes);
        for(var i=0;i<keys.length;i++){
            var userid = keys[i];
            var lightning = lightningnodes[userid]

            var newtransactions = lightning.newtransactions();
            if(newtransactions.length > 0)
            {
              var message = {"method": "newtransactions", "params": newtransactions};
              signalR.sendToUser(userid, message);
              logger.silly(userid, "New transactions sent.");
            }

            var newchannels = lightning.newchannels();
            if(newchannels.length > 0)
            {
              var message = {"method": "newchannels", "params": newchannels};
              signalR.sendToUser(userid, message);
              logger.silly(userid, "New channels sent.");
            }

            if(lightning.shouldupdate() == true)
            {
              var message = {"method": "refresh", "params": []};
              signalR.sendToUser(userid, message);
              logger.silly(userid, "New refresh sent.");
            }
        }
      }
      catch (e) {
        logger.error("SignalR refresh cycle failed with error: " + e.message);
      }
    }, 1000)
});
logger.info("Started SignalR handler.");
