'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const BodyParser = require("body-parser");
const Config = require("config");
const CookieParser = require("cookie-parser");
const Express = require("express");
const FS = require("fs");
const https = require("https");
const LevelStoreCreator = require("express-session-level");
const Passport = require("passport");
const PassportLocal = require("passport-local");
const Path = require("path");
const Session = require("express-session");
const SwaggerJSDoc = require("swagger-jsdoc");
const WebSocket = require("ws");
const logger = require("./logger");
const usermanager_1 = require("./utilities/usermanager");
const walletv1 = require("./routes/walletv1");
const LevelDown_1 = require("LevelDown");
const LevelUp_1 = require("LevelUp");
const LevelStore = LevelStoreCreator(Session);
// Implemented best practices from:
// https://expressjs.com/en/advanced/best-practice-security.html#use-cookies-securely
// Initialize levelDB storage
var db = LevelUp_1.default(LevelDown_1.default('./mydb'));
Passport.use(new PassportLocal.Strategy(function (username, password, done) {
    process.nextTick(function () {
        var user = usermanager_1.userManager.getuser(username);
        if (!user) {
            logger.error(username, "Login attempt for invalid user.");
            return done(null, false);
        }
        else if (!user.password) {
            return usermanager_1.userManager.updatepassword(username, password, (user) => {
                if (user == null) {
                    logger.error(username, "Failed first time login.");
                    done(null, false);
                }
                else {
                    logger.verbose(username, "Successful first time login.");
                    return done(null, user);
                }
            });
        }
        else {
            return usermanager_1.userManager.verifypassword(username, password, (success, user) => {
                if (success == true) {
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
}));
Passport.serializeUser(function (user, cb) {
    logger.silly(user.id, "Serializing user to session.");
    cb(null, user);
});
Passport.deserializeUser(function (obj, cb) {
    logger.silly("Attempting to load user from session.");
    cb(null, obj);
});
// swagger definition
var swaggerDefinition = {
    info: {
        title: 'myLightning',
        version: '1.0.0',
        description: 'REST API specification for the myLightning web wallet. [Work In Progress!!!]',
    },
    host: 'localhost:8444',
    basePath: '/',
};
// options for the swagger docs
var options = {
    // import swaggerDefinitions
    swaggerDefinition: swaggerDefinition,
    // path to the API docs
    apis: ['./routes/*.js'],
};
// initialize swagger-jsdoc
var swaggerSpec = SwaggerJSDoc(options);
var app = Express();
logger.info("Configuring express");
var expiryDate = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
const sessionParser = Session({
    secret: 'FKU6LHLT',
    store: new LevelStore(db),
    resave: true,
    saveUninitialized: true,
    cookie: {
        httpOnly: true,
        secure: true
    }
});
app
    .use(BodyParser.json()) // support json encoded bodies
    .use(BodyParser.urlencoded({ extended: true })) // support encoded bodies
    .use(CookieParser('PP3T7LHQ'))
    .use(sessionParser)
    .use(Passport.initialize())
    .use(Passport.session());
// serve swagger
app.get('/swagger.json', function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
});
app.get('/login', function (req, res) {
    res.sendfile(Path.join(__dirname, "..", "www/views/login.html"));
});
app.post('/login', Passport.authenticate('local'), function (req, res) {
    if (req.user != null) {
        logger.info(req.user.id, "Successfully authenticated.");
    }
    else {
        logger.error("Unauthorized login attempt with invalid password.");
    }
    // do something with req.user
    res.sendStatus(req.user ? 200 : 401);
});
// Add wallet service v1.
app.use('/rest/v1', walletv1);
logger.info("Configured REST routes");
// Blanketly require authentication beyond this point before using any other resources.
app.use('*', function (req, res, next) {
    logger.silly("Attempting session authorization.");
    if (req.isAuthenticated()) {
        if (usermanager_1.userManager.getuser(req.user.id).rpcport == null) {
            // Redirect to new account if ports aren't set up.
            res.redirect('/newaccount');
        }
        else
            next();
    }
    else {
        // Attempt token authentication for the rest api
        if (req.baseUrl.includes('rest/v1')) {
            res.sendStatus(401);
        }
        else {
            res.redirect('/login');
        }
    }
});
// Allow static access to views.
app.use(Express.static(Path.join(__dirname, "..", "www")));
app.get('*', function (req, res) {
    res.sendStatus(404);
});
// Initialize SSL settings
var sslOptions = {
    key: FS.readFileSync('./certs/key.pem'),
    cert: FS.readFileSync('./certs/cert.pem'),
    ca: FS.readFileSync('./certs/ca.pem')
};
var httpsServer = https.createServer(sslOptions, app).listen(Config.get("webport"));
logger.info("Started express server on port " + Config.get("webport"));
// Create an instance of websocket server.
var wss = new WebSocket.Server({
    verifyClient: (info, done) => {
        sessionParser(info.req, {}, () => {
            if (info.req.session.passport == null) {
                logger.error("Login attempt with invalid session.");
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
            if (userid != null) {
                var lightning = walletv1.lightningnodes[userid];
                var newtransactions = lightning.newtransactions();
                if (newtransactions.length > 0) {
                    var message = { "method": "newtransactions", "params": newtransactions };
                    ws.send(JSON.stringify(message));
                    logger.silly(userid, "New transactions sent.");
                }
                var newchannels = lightning.newchannels();
                if (newchannels.length > 0) {
                    var message = { "method": "newchannels", "params": newchannels };
                    ws.send(JSON.stringify(message));
                    logger.silly(userid, "New channels sent.");
                }
                if (lightning.shouldupdate() == true) {
                    var message2 = { "method": "refresh", "params": [] };
                    ws.send(JSON.stringify(message2));
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
