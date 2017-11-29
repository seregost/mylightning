'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
var Express = require("express");
var csurf = require("csurf");
var fs = require("fs");
var logger = require("../logger");
var passport = require("passport");
var qr = require("qr-image");
var lightning_1 = require("../lightning/lightning");
var usermanager_1 = require("../utilities/usermanager");
var WalletService = /** @class */ (function () {
    function WalletService() {
        var _this = this;
        /**
         *  @swagger
         *  /rest/v1/getalldata:
         *    get:
         *      tags:
         *      - "wallet"
         *      summary: "Returns all wallet data for the current user."
         *      description: ""
         *      operationId: "getalldata"
         *      produces:
         *      - "application/json"
         *      responses:
         *        200:
         *          description: "successful operation"
         *          schema:
         *            $ref: "#/definitions/DataResponse"
         *        401:
         *          description: "unauthorized"
         *      security:
         *      - cookieAuth: []
        */
        this.GetAllData = function (req, res) {
            var local = _this;
            try {
                var datapackage = { "user": { "id": req.user.id } };
                var dir = './db/' + req.user.id + '/';
                local.readjson(dir + 'address.json').then(function (data) {
                    datapackage.address = data;
                    return local.readjson(dir + 'info.json');
                }).then(function (data) {
                    datapackage.info = data;
                    return local.readjson(dir + 'balances.json');
                }).then(function (data) {
                    datapackage.balances = data;
                    return local.readjson(dir + 'channels.json');
                }).then(function (data) {
                    datapackage.channels = data;
                    return local.readjson(dir + 'quickpaynodes.json');
                }).then(function (data) {
                    datapackage.quickpaynodes = data;
                    return local.readjson(dir + 'transactions.json');
                }).then(function (data) {
                    datapackage.transactions = data;
                    datapackage._csrf = req.csrfToken();
                    res.send(datapackage);
                }).catch(function (error) {
                    logger.error(req.user.id, "Exception occurred in /rest/v1/getalldata: " + error);
                    res.sendStatus(500);
                });
            }
            catch (e) {
                logger.error(req.user.id, "Exception occurred in /rest/v1/getalldata: " + e.message);
                res.sendStatus(500);
            }
        };
        /**
         * TODO: Swagger DOC
         */
        this.RequestInvoice = function (req, res) {
            try {
                var pub_key = req.body.pub_key;
                var lightningnode = null;
                var keys = Object.keys(_this._lightningnodes);
                for (var i = 0; i < keys.length; i++) {
                    var userid = keys[i];
                    if (_this._lightningnodes[userid].PubKey == pub_key)
                        lightningnode = _this._lightningnodes[userid];
                }
                var memo = req.body.memo;
                var amount = req.body.amount;
                if (lightningnode == null) {
                    // No record of a user with the given pubkey.
                    logger.error(userid, "/rest/v1/requestinvoice failed.  No lightning node.");
                    res.sendStatus(404);
                }
                else {
                    lightningnode.createinvoice(memo, amount, false, function (response) {
                        logger.verbose(userid, "/rest/v1/requestinvoice succeeded.");
                        logger.debug(userid, JSON.stringify(response));
                        res.send(response);
                    });
                }
            }
            catch (e) {
                logger.error(userid, "Exception occurred in /rest/v1/requestinvoice: " + e.message);
                res.sendStatus(500);
            }
        };
        /**
         *  @swagger
         *  /rest/v1/login:
         *      post:
         *        tags:
         *        - wallet
         *        summary: "Logs user into the system"
         *        operationId: "login"
         *        produces:
         *        - application/json
         *        parameters:
         *        - in: body
         *          name: body
         *          required: true
         *          schema:
         *            $ref: '#/definitions/LoginRequest'
         *        responses:
         *          200:
         *            description: login succeeded
         *            headers:
         *              set-cookie:
         *                type: string
         *          401:
         *            description: unauthorized
        */
        this.Login = function (req, res) {
            if (req.user != null) {
                logger.info(req.user.id, "Successfully authenticated.");
            }
            else {
                logger.error("Unauthorized login attempt with invalid password.");
            }
            // do something with req.user
            res.sendStatus(req.user ? 200 : 401);
        };
        /**
         *  @swagger
         *  /rest/v1/logout:
         *    post:
         *      tags:
         *      - "wallet"
         *      summary: "Logs user out"
         *      description: ""
         *      operationId: "logout"
         *      produces:
         *      - "application/json"
         *      responses:
         *        200:
         *          description: "logout succeeded"
         *        400:
         *          description: "Invalid status value"
         *      security:
         *      - cookieAuth: []
         *      - csrfGuard: []
         */
        this.Logout = function (req, res) {
            logger.info(req.user.id, "Successful logout.");
            req.session.destroy(function (err) { });
        };
        /**
         *  @swagger
         *  /rest/v1/ping:
         *    get:
         *      tags:
         *      - "wallet"
         *      summary: "Ping server to validate session."
         *      description: ""
         *      operationId: "ping"
         *      consumes:
         *      - "application/json"
         *      produces:
         *      - "application/json"
         *      responses:
         *        200:
         *          description: "session is valid"
         *        401:
         *          description: "unauthorized"
         *      security:
         *      - cookieAuth: []
         */
        this.Ping = function (req, res) {
            res.sendStatus(200);
        };
        /**
         *  @swagger
         *  /rest/v1/sendinvoice:
         *    post:
         *      tags:
         *      - "wallet"
         *      summary: "Sends an invoice with the specified invoiceid."
         *      description: ""
         *      operationId: "sendinvoice"
         *      consumes:
         *      - "application/json"
         *      parameters:
         *      - in: "body"
         *        name: "body"
         *        required: true
         *        schema:
         *          $ref: "#/definitions/SendInvoiceRequest"
         *      produces:
         *      - "application/json"
         *      responses:
         *        200:
         *          description: "sent to network.  see error response for any network errors."
         *          schema:
         *            $ref: "#/definitions/GenericResponse"
         *        401:
         *          description: "unauthorized"
         *      security:
         *      - cookieAuth: []
         *      - csrfGuard: []
         */
        this.SendInvoice = function (req, res) {
            try {
                var userid = req.user.id;
                var invoiceid = req.body.invoiceid;
                var alias = req.body.alias;
                var password = req.body.password;
                _this._userManager.VerifyPassword(userid, password, function (success, user) {
                    if (success == false) {
                        logger.verbose(userid, "Invalid password entered.");
                        res.send({ "error": { "message": "The PIN you entered was invalid.  Please try again." } });
                    }
                    else {
                        _this._lightningnodes[userid].SendInvoice(invoiceid, alias)
                            .then(function (response) {
                            logger.verbose(userid, "/rest/v1/sendinvoice succeeded.");
                            logger.debug(userid, "Response:" + JSON.stringify(response));
                            res.send(response);
                        }).catch(function (err) {
                            logger.verbose(userid, "/rest/v1/sendinvoice failed.");
                            logger.debug(userid, "Response:" + JSON.stringify(err));
                            res.send(err);
                        });
                    }
                });
            }
            catch (e) {
                logger.error(userid, "Exception occurred in /rest/v1/sendinvoice: " + e.message);
                res.sendStatus(500);
            }
        };
        /**
         * TODO: Swagger DOC
         */
        this.QuickPay = function (req, res) {
            try {
                var userid = req.user.id;
                var dest = req.body.dest;
                var amount = req.body.amount;
                var memo = req.body.memo;
                var password = req.body.password;
                _this._userManager.VerifyPassword(userid, password, function (success, user) {
                    if (success == false) {
                        logger.verbose(userid, "Invalid password entered.");
                        res.send({ "error": { "message": "The PIN you entered was invalid.  Please try again." } });
                    }
                    else {
                        _this._lightningnodes[userid].QuickPay(dest, amount, memo)
                            .then(function (response) {
                            logger.verbose(userid, "/rest/v1/quickpay succeeded");
                            logger.debug(userid, "Response:" + JSON.stringify(response));
                            res.send(response);
                        }).catch(function (err) {
                            logger.verbose(userid, "/rest/v1/quickpay failed.");
                            logger.debug(userid, "Response:" + JSON.stringify(err));
                            res.send(err);
                        });
                    }
                });
            }
            catch (e) {
                logger.error(userid, "Exception occurred in /rest/v1/quickpay: " + e.message);
                res.sendStatus(500);
            }
        };
        /**
         * TODO: Swagger DOC
         */
        this.CreateInvoice = function (req, res) {
            try {
                var userid = req.user.id;
                var memo = req.body.memo;
                var amount = req.body.amount;
                var quickpay = req.body.quickpay;
                _this._lightningnodes[userid].CreateInvoice(memo, amount, quickpay)
                    .then(function (response) {
                    logger.verbose(userid, "/rest/v1/createinvoice succeeded.");
                    logger.debug(userid, "Response:" + JSON.stringify(response));
                    res.send(response);
                }).catch(function (err) {
                    logger.verbose(userid, "/rest/v1/createinvoice failed.");
                    logger.debug(userid, "Response:" + JSON.stringify(err));
                    res.send(err);
                });
            }
            catch (e) {
                logger.error(userid, "Exception occurred in /rest/v1/quickpay: " + e.message);
                res.sendStatus(500);
            }
        };
        /**
         * TODO: Swagger DOC
         */
        this.OpenChannel = function (req, res) {
            try {
                var userid = req.user.id;
                var remotenode = req.body.remotenode;
                var amount = req.body.amount;
                // TODO: Verify password on open channel.
                _this._lightningnodes[userid].OpenChannel(remotenode, amount)
                    .then(function (response) {
                    logger.verbose(userid, "/rest/v1/openchannel succeeded.");
                    logger.debug(userid, "Response:" + JSON.stringify(response));
                    res.send(response);
                }).catch(function (err) {
                    logger.verbose(userid, "/rest/v1/openchannel failed.");
                    logger.debug(userid, "Response:" + JSON.stringify(err));
                    res.send(err);
                });
            }
            catch (e) {
                logger.error(userid, "Exception occurred in /rest/v1/openchannel: " + e.message);
                res.sendStatus(500);
            }
        };
        /**
         * TODO: Swagger DOC
         */
        this.CloseChannel = function (req, res) {
            try {
                var userid = req.user.id;
                var channelpoint = req.body.channelpoint;
                var password = req.body.password;
                _this._userManager.VerifyPassword(userid, password, function (success, user) {
                    if (success == false) {
                        logger.verbose(userid, "Invalid password entered.");
                        res.send({ "error": { "message": "The PIN you entered was invalid.  Please try again." } });
                    }
                    else {
                        _this._lightningnodes[userid].CloseChannel(channelpoint)
                            .then(function (response) {
                            logger.verbose(userid, "/rest/v1/closechannel succeeded.");
                            logger.debug(userid, "Response:" + JSON.stringify(response));
                            res.send(response);
                        }).catch(function (err) {
                            logger.verbose(userid, "/rest/v1/closechannel failed.");
                            logger.debug(userid, "Response:" + JSON.stringify(err));
                            res.send(err);
                        });
                    }
                });
            }
            catch (e) {
                logger.error(userid, "Exception occurred in /rest/v1/closechannel: " + e.message);
                res.sendStatus(500);
            }
        };
        /**
         * TODO: Swagger DOC
         */
        this.GetQRImage = function (req, res) {
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
        };
        this._router = Express.Router();
        this._lightningnodes = {};
        this._userManager = usermanager_1.UserManager.getInstance();
        this._AddRoutes();
    }
    Object.defineProperty(WalletService.prototype, "Router", {
        get: function () {
            return this._router;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(WalletService.prototype, "LightningNodes", {
        get: function () {
            return this._lightningnodes;
        },
        enumerable: true,
        configurable: true
    });
    WalletService.prototype._AddRoutes = function () {
        var local = this;
        // Start lightning daemons.
        local._userManager.each(function (userid, user) {
            var rpcport = user.rpcport;
            var peerport = user.peerport;
            if (rpcport != null) {
                logger.info(userid, "Started listener on port " + rpcport);
                local._lightningnodes[userid] = lightning_1.LightningFactory.getLightning(userid, rpcport, peerport);
            }
        });
        local._router.post('/login', passport.authenticate('local'), this.Login);
        local._router.post('/logout', this.Logout);
        // TODO: Do some QoS control on this to avoid spam?
        local._router.post('/requestinvoice', this.RequestInvoice);
        // Require CSRF protection for route entries past this point.
        local._router.use(csurf({ cookie: true }));
        // Handle CSRF error conditions.
        local._router.use(function (err, req, res, next) {
            if (err.code !== 'EBADCSRFTOKEN')
                return next(err);
            logger.error(req.user.id, "Detected potential request tampering: " + err.message);
            res.status(200);
            res.send({ "error": { "message": "Could not verify connection.  Please logout and try again." } });
        });
        // Blanketly require authentication beyond this point before using any other resources.
        local._router.use('*', function (req, res, next) {
            logger.silly("Attempting session authorization.");
            if (req.isAuthenticated()) {
                if (local._userManager.GetUser(req.user.id).rpcport == null) {
                    // Redirect to new account if ports aren't set up.
                    res.redirect('/newaccount');
                }
                else
                    next();
            }
            else {
                // Attempt token authentication for the rest api
                if (req.baseUrl.includes('rest/v1'))
                    res.sendStatus(401);
                else
                    res.redirect('/login');
            }
        });
        local._router.get('/ping', this.Ping);
        local._router.post('/sendinvoice', this.SendInvoice);
        local._router.post('/quickpay', this.QuickPay);
        local._router.post('/createinvoice', this.CreateInvoice);
        local._router.post('/openchannel', this.OpenChannel);
        local._router.post('/closechannel', this.CloseChannel);
        local._router.get('/getqrimage', this.GetQRImage);
        local._router.get('/getalldata', this.GetAllData);
    };
    WalletService.prototype.readjson = function (path) {
        return new Promise(function (resolve, reject) {
            if (!fs.existsSync(path)) {
                logger.debug("Tried to fetch a file that doesn't exist: " + path);
                resolve(JSON.parse("{}"));
            }
            else {
                fs.readFile(path, 'utf8', function (err, data) {
                    if (err)
                        reject(err);
                    if (data.length == 0)
                        data = "{}";
                    resolve(JSON.parse(data));
                });
            }
        });
    };
    return WalletService;
}());
exports.WalletService = WalletService;
