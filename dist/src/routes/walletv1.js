const config = require('config');
const csurf = require('csurf');
const express = require('express');
const fs = require('fs');
const Lightning = require("../lightning/" + config.get("lightning-node"));
const logger = require("../logger");
const passport = require('passport');
const qr = require('qr-image');
const router = express.Router();
var userManager = require("../utilities/usermanager").userManager;
var lightningnodes = {};
// Start lightning daemons.
userManager.each((userid, user) => {
    var rpcport = user.rpcport;
    var peerport = user.peerport;
    if (rpcport != null) {
        logger.info(userid, "Started listener on port " + rpcport);
        lightningnodes[userid] = new Lightning(userid, rpcport, peerport);
    }
});
// REST Specification:
// https://editor.swagger.io/?_ga=2.214030551.1199320075.1511718443-1620193370.1511718443
/**
 *  @swagger
 *  securityDefinitions:
 *    cookieAuth:
 *      type: "apiKey"
 *      name: "connect.sid"
 *      in: "header"
 *      description: "All authenticate methods must supply a cookie in header."
 *    csrfGuard:
 *      type: "apiKey"
 *      name: "_csrf"
 *      in: "query"
 *      description: "For post methods, must supply _csrf key returned from getalldata."
 *  @swagger
 *  definitions:
 *    LoginRequest:
 *      type: "object"
 *      properties:
 *        username:
 *          type: "string"
 *        password:
 *          type: "string"
 *    CreateInvoiceRequest:
 *      type: "object"
 *      properties:
 *        amount:
 *          type: "number"
 *          description: "Amount to request in users defined [denomination]."
 *        memo:
 *          type: "string"
 *          description: "Memo to associate with invoice"
 *        quickpay:
 *          type: "boolean"
 *          description: "Whether to include a quickpay address in the resulting payment request."
 *    SendInvoiceRequest:
 *      type: "object"
 *      properties:
 *        invoiceid:
 *          type: "string"
 *          description: "Network defined payment_request for the invoice"
 *        alias:
 *          type: "string"
 *          description: "Future alias to add to address book for the recipient of this invoice."
 *        password:
 *          type: "string"
 *          description: "Password for currently logged in user."
 *    QuickPayRequest:
 *      type: "object"
 *      properties:
 *        dest:
 *          type: "string"
 *          description: "Alias of destination node as included in the address book."
 *        amount:
 *          type: "number"
 *          description: "Amount to pay in user defined [denomination]."
 *        memo:
 *          type: "string"
 *          description: "Memo to associate with invoice"
 *        password:
 *          type: "string"
 *          description: "Password for currently logged in user."
 *    OpenChannelRequest:
 *      type: "object"
 *      properties:
 *        remotenode:
 *          type: "string"
 *          description: "Unique identifier for the remote node."
 *        amount:
 *          type: "number"
 *          description: "Channel capacity in user defined [denomination]."
 *        password:
 *          type: "string"
 *          description: "Password for currently logged in user."
 *    CloseChannelRequest:
 *      type: "object"
 *      properties:
 *        channelpoint:
 *          type: "string"
 *          description: "Unique identifier for the channel to close"
 *        password:
 *          type: "string"
 *          description: "Password for currently logged in user."
 *    DataResponse:
 *      type: "object"
 *      properties:
 *        address:
 *          type: "string"
 *        balances:
 *          $ref: "#/definitions/Balances"
 *        info:
 *          $ref: "#/definitions/Info"
 *        channels:
 *          items:
 *            $ref: "#/definitions/Channel"
 *    GenericResponse:
 *      type: "object"
 *      properties:
 *        error:
 *          $ref: "#/definitions/Error"
 *    CreateInvoiceResponse:
 *      type: "object"
 *      properties:
 *        payment_request:
 *          type: "string"
 *          description: "code for the payment request for customers to send payment."
 *        error:
 *          $ref: "#/definitions/Error"
 *    Error:
 *      type: "object"
 *      properties:
 *        message:
 *          type: "string"
 *    Info:
 *      type: "object"
 *      properties:
 *        nodeId:
 *          type: "string"
 *          description: "Node's public key"
 *        alias:
 *          type: "string"
 *        port:
 *          type: "integer"
 *        synchronized:
 *          type: "boolean"
 *          description: "Indicates status of blockchain synchronization"
 *        blockheight:
 *          type: "integer"
 *    Channel:
 *      type: "object"
 *      properties:
 *        node:
 *          type: "string"
 *          description: "Remote node's public key"
 *        channel:
 *          type: "string"
 *          description: "Channel ID"
 *        state:
 *          type: "string"
 *          description: "Current state of the channel"
 *        balance:
 *          type: "number"
 *          description: "Balance in user defined [denomination]."
 *        capacity:
 *          type: "number"
 *          description: "Capacity of channel in user defined [denomination]."
 *        channelpoint:
 *          type: "string"
 *    Balances:
 *      type: "object"
 *      properties:
 *        btcfunds:
 *          type: "number"
 *        lntfunds:
 *          type: "number"
*/
function readjson(path) {
    return new Promise((resolve, reject) => {
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
}
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
router.post('/login', passport.authenticate('local'), function (req, res) {
    if (req.user != null) {
        logger.info(req.user.id, "Successfully authenticated.");
    }
    else {
        logger.error("Unauthorized login attempt with invalid password.");
    }
    // do something with req.user
    res.sendStatus(req.user ? 200 : 401);
});
// TODO: Do some QoS control on this to avoid spam?
router.post('/requestinvoice', function (req, res) {
    try {
        var pub_key = req.body.pub_key;
        var lightningnode = null;
        var keys = Object.keys(lightningnodes);
        for (var i = 0; i < keys.length; i++) {
            var userid = keys[i];
            if (lightningnodes[userid].pubkey == pub_key)
                lightningnode = lightningnodes[userid];
        }
        var memo = req.body.memo;
        var amount = req.body.amount;
        if (lightningnode == null) {
            // No record of a user with the given pubkey.
            logger.error(userid, "/rest/v1/requestinvoice failed.  No lightning node.");
            res.sendStatus(404);
        }
        else {
            lightningnode.createinvoice(memo, amount, false, (response) => {
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
});
/**
 * Require CSRF protection for route entries past this point.
 */
router.use(csurf({ cookie: true }));
router.use(function (err, req, res, next) {
    if (err.code !== 'EBADCSRFTOKEN')
        return next(err);
    // handle CSRF token errors here
    logger.error(req.user.id, "Detected potential request tampering: " + err.message);
    res.status(200);
    res.send({ "error": { "message": "Could not verify connection.  Please logout and try again." } });
});
/**
 * Blanketly require authentication beyond this point before using any other resources.
 */
router.use('*', function (req, res, next) {
    logger.silly("Attempting session authorization.");
    if (req.isAuthenticated()) {
        if (userManager.getuser(req.user.id).rpcport == null) {
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
router.get('/ping', function (req, res) {
    res.sendStatus(200);
});
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
router.post('/logout', function (req, res) {
    logger.info(req.user.id, "Successful logout.");
    req.session.destroy();
});
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
router.post('/sendinvoice', function (req, res) {
    try {
        var userid = req.user.id;
        var invoiceid = req.body.invoiceid;
        var alias = req.body.alias;
        var password = req.body.password;
        userManager.verifypassword(userid, password, (success, user) => {
            if (success == false) {
                logger.verbose(userid, "Invalid password entered.");
                res.send({ "error": { "message": "The PIN you entered was invalid.  Please try again." } });
            }
            else {
                lightningnodes[userid].sendinvoice(invoiceid, alias, (response) => {
                    logger.verbose(userid, "/rest/v1/sendinvoice succeeded.");
                    logger.debug(userid, "Response:" + JSON.stringify(response));
                    res.send(response);
                });
            }
        });
    }
    catch (e) {
        logger.error(userid, "Exception occurred in /rest/v1/sendinvoice: " + e.message);
        res.sendStatus(500);
    }
});
router.post('/quickpay', function (req, res) {
    try {
        var userid = req.user.id;
        var dest = req.body.dest;
        var amount = req.body.amount;
        var memo = req.body.memo;
        var password = req.body.password;
        userManager.verifypassword(userid, password, (success, user) => {
            if (success == false) {
                logger.verbose(userid, "Invalid password entered.");
                res.send({ "error": { "message": "The PIN you entered was invalid.  Please try again." } });
            }
            else {
                lightningnodes[userid].quickpay(dest, amount, memo, (response) => {
                    logger.verbose(userid, "/rest/v1/quickpay succeeded");
                    logger.debug(userid, "Response:" + JSON.stringify(response));
                    res.send(response);
                });
            }
        });
    }
    catch (e) {
        logger.error(userid, "Exception occurred in /rest/v1/quickpay: " + e.message);
        res.sendStatus(500);
    }
});
router.post('/createinvoice', function (req, res) {
    try {
        var userid = req.user.id;
        var memo = req.body.memo;
        var amount = req.body.amount;
        var quickpay = req.body.quickpay;
        lightningnodes[userid].createinvoice(memo, amount, quickpay, (response) => {
            logger.verbose(userid, "/rest/v1/createinvoice succeeded.");
            logger.debug(userid, "Response:" + JSON.stringify(response));
            res.send(response);
        });
    }
    catch (e) {
        logger.error(userid, "Exception occurred in /rest/v1/quickpay: " + e.message);
        res.sendStatus(500);
    }
});
router.post('/openchannel', function (req, res) {
    try {
        var userid = req.user.id;
        var remotenode = req.body.remotenode;
        var amount = req.body.amount;
        lightningnodes[userid].openchannel(remotenode, amount, (response) => {
            logger.verbose(userid, "/rest/v1/openchannel succeeded.");
            logger.debug(userid, "Response:" + JSON.stringify(response));
            res.send(response);
        });
    }
    catch (e) {
        logger.error(userid, "Exception occurred in /rest/v1/openchannel: " + e.message);
        res.sendStatus(500);
    }
});
router.post('/closechannel', function (req, res) {
    try {
        var userid = req.user.id;
        var channelpoint = req.body.channelpoint;
        var password = req.body.password;
        userManager.verifypassword(userid, password, (success, user) => {
            if (success == false) {
                logger.verbose(userid, "Invalid password entered.");
                res.send({ "error": { "message": "The PIN you entered was invalid.  Please try again." } });
            }
            else {
                lightningnodes[userid].closechannel(channelpoint, (response) => {
                    logger.verbose(userid, "/rest/v1/closechannel succeeded.");
                    logger.debug(userid, "Response:" + JSON.stringify(response));
                    res.send(response);
                });
            }
        });
    }
    catch (e) {
        logger.error(userid, "Exception occurred in /rest/v1/closechannel: " + e.message);
        res.sendStatus(500);
    }
});
router.get('/getqrimage', function (req, res) {
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
});
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
router.get('/getalldata', function (req, res) {
    try {
        var datapackage = { "user": { "id": req.user.id } };
        var dir = './db/' + req.user.id + '/';
        readjson(dir + 'address.json').then((data) => {
            datapackage.address = data;
            return readjson(dir + 'info.json');
        }).then((data) => {
            datapackage.info = data;
            return readjson(dir + 'balances.json');
        }).then((data) => {
            datapackage.balances = data;
            return readjson(dir + 'channels.json');
        }).then((data) => {
            datapackage.channels = data;
            return readjson(dir + 'quickpaynodes.json');
        }).then((data) => {
            datapackage.quickpaynodes = data;
            return readjson(dir + 'transactions.json');
        }).then((data) => {
            datapackage.transactions = data;
            datapackage._csrf = req.csrfToken();
            res.send(datapackage);
        }).catch((error) => {
            logger.error(req.user.id, "Exception occurred in /rest/v1/getalldata: " + error);
            res.sendStatus(500);
        });
    }
    catch (e) {
        logger.error(req.user.id, "Exception occurred in /rest/v1/getalldata: " + e.message);
        res.sendStatus(500);
    }
});
module.exports = router;
module.exports.lightningnodes = lightningnodes;
