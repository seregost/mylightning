'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
var request = require('request');
var bitcoin = require('bitcoin');
var _ = require('lodash');
var config = require('config');
var ByteBuffer = require('bytebuffer');
var qr = require('qr-image');
var fs = require('fs');
var sortJsonArray = require('sort-json-array');
var logger = require("../logger");
var grpc = require('grpc');
// sudo sysctl -w net.ipv4.conf.p4p1.route_localnet=1
// sudo iptables -t nat -I PREROUTING -p tcp -d 192.168.2.0/24 --dport 10001 -j DNAT --to-destination 127.0.0.1:10001
var LNDLighting = /** @class */ (function () {
    function LNDLighting(id, rpcport, peerport) {
        var _this = this;
        this._userid = id;
        this._hasupdate = false;
        this._lightning = this._getConnection(rpcport);
        this._newtransactions = [];
        this._newchannels = [];
        this._peerport = peerport;
        this._quickpaynodes = {};
        if (!fs.existsSync('./db/' + this._userid + '/quickpaynodes.json')) {
            this._quickpaynodes = {};
        }
        else {
            fs.readFile('./db/' + this._userid + '/quickpaynodes.json', 'utf8', function (err, data) {
                if (err)
                    throw err;
                _this._quickpaynodes = JSON.parse(data);
            });
            logger.debug(this._userid, "Loaded quickpaynodes");
        }
        this._refresh();
        setInterval(function () { _this._refresh(); }, 10000);
        // Subscribe to invoices.
        var invoices = this._lightning.subscribeInvoices({});
        invoices.on('data', function (message) {
            _this._newtransactions.push({
                "type": "Invoice",
                "memo": message.memo,
                "value": message.value / config.get("unitrate"),
                "payment_request": message.payment_request
            });
            logger.verbose(_this._userid, "Detected a new payment.");
            logger.debug(JSON.stringify(message));
            _this._refresh();
        });
        invoices.on('end', function () {
            // The server has finished sending
            console.log("END");
        });
        invoices.on('status', function (status) {
            // Process status
            console.log("Current status: " + status);
        });
        // Subscribe to invoices.
        var channels = this._lightning.subscribeChannelGraph({});
        channels.on('data', function (message) {
            var shouldrefresh = false;
            message.channel_updates.forEach(function (value) {
                // If we are the recipient of the new channel.
                if (value.advertising_node == _this._pubkey) {
                    _this._newchannels.push({
                        "channelid": value.chan_id,
                        "channelpoint": value.chan_point,
                        "capacity": parseInt(value.capacity) / config.get("unitrate"),
                        "remotenode": value.connecting_node
                    });
                    shouldrefresh = true;
                    logger.info(_this._userid, "Detected a new channel opening.");
                    logger.debug(_this._userid, "Response: ", JSON.stringify(value));
                }
            });
            if (shouldrefresh)
                _this._refresh();
        });
        channels.on('end', function () {
            // The server has finished sending
            console.log("END");
        });
        channels.on('status', function (status) {
            // Process status
            console.log("Current status: " + status);
        });
    }
    ////////////////////////////////
    // ILightning Implementation
    ////////////////////////////////
    LNDLighting.prototype.Close = function () {
        grpc.closeClient(this._lightning);
    };
    Object.defineProperty(LNDLighting.prototype, "ShouldUpdate", {
        get: function () {
            if (this._hasupdate == true) {
                this._hasupdate = false;
                return true;
            }
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(LNDLighting.prototype, "NewTransactions", {
        get: function () {
            if (this._newtransactions.length > 0) {
                var temp = this._newtransactions;
                this._newtransactions = [];
                return temp;
            }
            return [];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(LNDLighting.prototype, "NewChannels", {
        get: function () {
            if (this._newchannels.length > 0) {
                var temp = this._newchannels;
                this._newchannels = [];
                return temp;
            }
            return [];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(LNDLighting.prototype, "PubKey", {
        get: function () {
            return this._pubkey;
        },
        enumerable: true,
        configurable: true
    });
    LNDLighting.prototype.SendPayment = function (pub_key, amt, payment_hash) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var dest = ByteBuffer.fromHex(pub_key);
            var payhash = ByteBuffer.fromHex(payment_hash);
            var call = _this._lightning.SendPaymentSync({ "dest": dest, "amt": (amt * config.get("unitrate")), "payment_hash_string": payment_hash }, function (err, response) {
                if (err != null) {
                    logger.error(_this._userid, "lnd.sendpayment failed: " + JSON.stringify(err));
                    reject({ "error": { "message": err } });
                }
                else {
                    logger.debug(_this._userid, "lnd.sendpayment succeeded.");
                    resolve({});
                }
            });
        });
    };
    LNDLighting.prototype.SendInvoice = function (invoiceid, alias) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var nodepath = invoiceid.split("@");
            var pay_req = nodepath[0];
            var dopayment = function () {
                _this._lightning.SendPaymentSync({ "payment_request": pay_req }, function (err, response) {
                    if (err != null) {
                        logger.error(_this._userid, "lnd.sendinvoice failed: ", JSON.stringify(err));
                        reject({ "error": { "message": err.message } });
                    }
                    else if (response.payment_error != null && response.payment_error.length > 0) {
                        logger.error(_this._userid, "lnd.sendinvoice failed: ", JSON.stringify(response));
                        reject({ "error": { "message": response.payment_error } });
                    }
                    else {
                        logger.debug(_this._userid, "lnd.sendinvoice succeeded.");
                        _this._refresh();
                        resolve({});
                    }
                });
            };
            if (nodepath.length > 1) {
                _this._lightning.decodePayReq({ "pay_req": pay_req }, function (err, response) {
                    if (err != null) {
                        logger.error(_this._userid, "lnd.decodePayReq failed: " + JSON.stringify(err));
                        reject({ "error": { "message": err.message } });
                    }
                    if (alias != null) {
                        _this._quickpaynodes[response.destination] = { "alias": alias, "server": nodepath[1] };
                        var dir = './db/' + _this._userid + '/';
                        fs.writeFileSync(dir + 'quickpaynodes.json', JSON.stringify(_this._quickpaynodes, null, 2));
                        logger.verbose(_this._userid, "lnd.sendinvoice added new quickpaynode for pub_key: ", response.destination);
                        dopayment();
                    }
                });
            }
            else {
                dopayment();
            }
        });
    };
    LNDLighting.prototype.QuickPay = function (pub_key, amount, memo) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var server = _this._quickpaynodes[pub_key].server;
            if (server == null) {
                logger.error(_this._userid, "lnd.quickpay failed to find server for pub_key: ", pub_key);
                reject({ "error": { "message": "Cannot find address to request invoice." } });
            }
            else {
                var request = require('request');
                request({
                    uri: "https://" + server + "/rest/v1/requestinvoice",
                    method: "POST",
                    agentOptions: {
                        rejectUnauthorized: false
                    },
                    json: true,
                    body: { "pub_key": pub_key, "amount": amount, "memo": memo }
                }, function (error, response, body) {
                    if (error != null) {
                        logger.error(_this._userid, "lnd.quickpay requestinvoice failed with response: ", error.message);
                        reject({ "error": { "message": error.message } });
                    }
                    else if (body.error != null) {
                        logger.error(_this._userid, "lnd.quickpay requestinvoice failed with response: ", body.error.message);
                        reject({ "error": { "message": body.error.message } });
                    }
                    else {
                        logger.debug(_this._userid, "lnd.quickpay succeeded.");
                        _this.SendInvoice(body.payment_request, "")
                            .then(function (response) { return resolve(response); })
                            .catch(function (err) { return reject(err); });
                    }
                });
            }
        });
    };
    LNDLighting.prototype.CreateInvoice = function (memo, amount, quickpay) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this._lightning.AddInvoice({ "memo": memo, "value": (amount * config.get("unitrate")) }, function (err, response) {
                if (err != null) {
                    logger.error(_this._userid, "lnd.createinvoice failed: " + JSON.stringify(err));
                    reject({ "error": { "message": err.message } });
                }
                else {
                    var quickpay_request = response.payment_request + "@" + config.get("webserver") + "}:" + config.get("webport");
                    if (quickpay == true) {
                        response.payment_request = quickpay_request;
                    }
                    logger.debug(_this._userid, "lnd.createinvoice succeeded.");
                    resolve(response);
                }
            });
        });
    };
    LNDLighting.prototype.OpenChannel = function (nodeid, amount) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var nodepath = nodeid.split("@");
            // List peers
            _this._lightning.listPeers({}, function (err, response) {
                if (err != null) {
                    logger.error(_this._userid, "lnd.openchannel failed on listPeers: " + JSON.stringify(err));
                    reject({ "error": { "message": err.message } });
                }
                else {
                    var peerid = -1;
                    response.peers.forEach(function (value) {
                        if (value.pub_key == nodepath[0]) {
                            peerid = value.peer_id;
                            return false;
                        }
                    });
                    if (peerid == -1) {
                        if (nodepath.length < 2) {
                            logger.error(_this._userid, "lnd.openchannel failed.  No peer found, so must specify a host name.");
                            resolve({ "error": { "message": "No peer found, so must specify a host name." } });
                        }
                        else
                            _this._opennewpeer(nodepath[0], nodepath[1], (amount * config.get("unitrate")))
                                .then(function (response) { return resolve(response); })
                                .catch(function (err) { return reject(err); });
                    }
                    else {
                        _this._opennewchannel(peerid, nodepath[0], (amount * config.get("unitrate")))
                            .then(function (response) { return resolve(response); })
                            .catch(function (err) { return reject(err); });
                    }
                }
            });
        });
    };
    LNDLighting.prototype.CloseChannel = function (channelid) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            try {
                _this._lightning.GetChanInfo({ "chan_id": channelid }, function (err, response) {
                    if (err != null) {
                        logger.error(_this._userid, "lnd.closechannel failed on GetChanInfo: " + JSON.stringify(err));
                        reject({ "error": { "message": err.message } });
                    }
                    else {
                        logger.verbose(_this._userid, "Channel point to close: ", response.chan_point);
                        var channel_point = response.chan_point.split(':');
                        var call = _this._lightning.CloseChannel({
                            "channel_point": {
                                "funding_txid": ByteBuffer.fromHex(channel_point[0]).reverse(),
                                "output_index": parseInt(channel_point[1])
                            }
                        });
                        call.on('data', function (message) {
                            logger.info(_this._userid, "lnd.closechannel succeeded.  Channel closed.");
                            resolve(message);
                        });
                        call.on('error', function (err) {
                            // The server has finished sending
                            logger.error(_this._userid, "lnd.closechannel failed: " + err.message);
                            reject({ "error": { "message": err } });
                        });
                    }
                });
            }
            catch (e) {
                logger.error(_this._userid, "lnd.closechannel failed.  Error code:" + e);
                reject({ "error": { "message": e } });
            }
        });
    };
    LNDLighting.prototype._refresh = function () {
        var _this = this;
        try {
            var channels = [];
            var test = [];
            var dir = './db/' + this._userid + '/';
            var local = this;
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir);
            }
            if (!fs.existsSync(dir + '/address.json')) {
                // Get a new bitcoin segwit address
                this._getaddress(function (response) {
                    fs.writeFileSync(dir + 'address.json', JSON.stringify(response));
                });
            }
            this._getinfo(function (response) {
                try {
                    local._pubkey = response.nodeId;
                    fs.writeFileSync(dir + 'info.json', JSON.stringify(response));
                    local._getbalance(function (balance) {
                        local._getfunds(function (funds) {
                            var balances = {
                                "btcfunds": (balance + funds) / config.get("unitrate"),
                                "lntfunds": funds / config.get("unitrate")
                            };
                            fs.writeFileSync(dir + 'balances.json', JSON.stringify(balances));
                            local._channels(function (channels) {
                                sortJsonArray(channels, 'channel');
                                fs.writeFileSync(dir + 'channels.json', JSON.stringify(channels));
                                local._gettransactions(function (transactions) {
                                    local._getpayments(function (payments) {
                                        local._getsettledinvoices(function (invoices) {
                                            if (payments.error == null)
                                                transactions = transactions.concat(payments);
                                            if (invoices.error == null)
                                                transactions = transactions.concat(invoices);
                                            sortJsonArray(transactions, 'time_stamp', 'des');
                                            transactions = transactions.slice(0, 50);
                                            fs.writeFileSync(dir + 'transactions.json', JSON.stringify(transactions));
                                            local._hasupdate = true;
                                        });
                                    });
                                });
                            });
                        });
                    });
                }
                catch (e) {
                    logger.error(_this._userid, "Failed to refresh information with error: " + e.message);
                }
            });
        }
        catch (e) {
            logger.error(this._userid, "Failed to refresh information with error: " + e.message);
        }
    };
    LNDLighting.prototype._getaddress = function (callback) {
        var _this = this;
        this._lightning.NewWitnessAddress({}, function (err, response) {
            if (err != null) {
                logger.error(_this._userid, "lnd.getaddress failed with error: " + JSON.stringify(err));
                callback({ "error": { "message": err } });
                return;
            }
            logger.silly(_this._userid, "lnd.getaddress succeeded.");
            callback(response.address);
        });
    };
    LNDLighting.prototype._getbalance = function (callback) {
        var _this = this;
        this._lightning.WalletBalance({ "witness_only": true }, function (err, response) {
            if (err != null) {
                logger.error(_this._userid, "lnd.getbalance failed: " + JSON.stringify(err));
                callback({ "error": { "message": err } });
                return;
            }
            logger.silly(_this._userid, "lnd.getbalance succeeded.");
            callback(parseInt(response.balance));
        });
    };
    LNDLighting.prototype._getfunds = function (callback) {
        var _this = this;
        this._lightning.ChannelBalance({}, function (err, response) {
            if (err != null) {
                logger.error(_this._userid, "lnd.getfunds failed: " + JSON.stringify(err));
                callback({ "error": { "message": err } });
                return;
            }
            logger.silly(_this._userid, "lnd.getfunds succeeded.");
            callback(parseInt(response.balance));
        });
    };
    LNDLighting.prototype._getinfo = function (callback) {
        var _this = this;
        this._lightning.GetInfo({}, function (err, response) {
            if (err != null) {
                logger.error(_this._userid, "lnd.getinfo failed: " + JSON.stringify(err));
                callback({ "error": { "message": err } });
                return;
            }
            var info = {
                "nodeId": response.identity_pubkey,
                "alias": config.get("netip"),
                "port": _this._peerport,
                "synchronized": response.synced_to_chain,
                "blockheight": response.block_height
            };
            logger.silly(_this._userid, "lnd.getinfo succeeded.");
            callback(info);
        });
    };
    LNDLighting.prototype._gettransactions = function (callback) {
        var _this = this;
        this._lightning.getTransactions({}, function (err, response) {
            if (err != null) {
                logger.error(_this._userid, "lnd._gettransactions failed: " + JSON.stringify(err));
                callback({ "error": { "message": err } });
                return;
            }
            var transactions = [];
            response.transactions.forEach(function (value) {
                transactions.push({
                    "hash": value.tx_hash,
                    "type": "transaction",
                    "amount": value.amount / config.get("unitrate"),
                    "num_confirmations": value.num_confirmations,
                    "time_stamp": value.time_stamp,
                    "total_fees": value.total_fees / config.get("unitrate")
                });
            });
            logger.silly(_this._userid, "lnd._gettransactions succeeded.");
            callback(transactions);
        });
    };
    LNDLighting.prototype._getpayments = function (callback) {
        var _this = this;
        this._lightning.listPayments({}, function (err, response) {
            if (err != null) {
                logger.error(_this._userid, "lnd._getpayments failed: " + JSON.stringify(err));
                callback({ "error": { "message": err } });
                return;
            }
            var payments = [];
            response.payments.forEach(function (value) {
                payments.push({
                    "hash": value.payment_hash,
                    "type": "payment",
                    "amount": value.value / config.get("unitrate"),
                    "num_confirmations": 0,
                    "time_stamp": value.creation_date,
                    "total_fees": value.fee / config.get("unitrate")
                });
            });
            logger.silly(_this._userid, "lnd._getpayments succeeded.");
            callback(payments);
        });
    };
    LNDLighting.prototype._getsettledinvoices = function (callback) {
        var _this = this;
        this._lightning.listInvoices({}, function (err, response) {
            if (err != null) {
                logger.debug(_this._userid, "lnd._getsettledinvoices failed: " + JSON.stringify(err));
                callback({ "error": { "message": err } });
                return;
            }
            var invoices = [];
            response.invoices.forEach(function (value) {
                if (value.settled == true) {
                    invoices.push({
                        "hash": value.payment_request,
                        "type": "invoice",
                        "amount": value.value / config.get("unitrate"),
                        "num_confirmations": 0,
                        "time_stamp": value.creation_date,
                        "total_fees": 0,
                        "memo": value.memo
                    });
                    logger.silly(_this._userid, "Found settled invoice.");
                }
            });
            callback(invoices);
        });
    };
    LNDLighting.prototype._channels = function (callback) {
        var _this = this;
        var channels = [];
        this._lightning.ListChannels({}, function (err, response) {
            if (err != null) {
                logger.error(_this._userid, "lnd.channels failed: " + JSON.stringify(err));
                callback({ "error": { "message": err } });
            }
            response.channels.forEach(function (value) {
                channels.push({
                    "node": value.remote_pubkey,
                    "channel": value.chan_id,
                    "state": "Open",
                    "balance": value.local_balance / config.get("unitrate"),
                    "capacity": value.capacity / config.get("unitrate"),
                    "channelpoint": value.channel_point
                });
            });
            // Calcu pending channels also.
            _this._lightning.PendingChannels({}, function (err, response) {
                if (err != null) {
                    logger.error(_this._userid, "lnd.pendingchannels failed: " + JSON.stringify(err));
                    callback({ "error": { "message": err } });
                }
                response.pending_open_channels.forEach(function (value) {
                    channels.push({
                        "node": value.channel.remote_node_pub,
                        "channel": "N/A",
                        "state": "Pending (" + value.blocks_till_open + " blocks)",
                        "balance": value.channel.local_balance / config.get("unitrate"),
                        "capacity": value.channel.capacity / config.get("unitrate"),
                        "channelpoint": value.channel.channel_point
                    });
                });
                response.pending_closing_channels.forEach(function (value) {
                    channels.push({
                        "node": value.channel.remote_node_pub,
                        "channel": "N/A",
                        "state": "Closing",
                        "balance": value.channel.local_balance / config.get("unitrate"),
                        "capacity": value.channel.capacity / config.get("unitrate"),
                        "channelpoint": value.channel.channel_point
                    });
                });
                response.pending_force_closing_channels.forEach(function (value) {
                    channels.push({
                        "node": value.channel.remote_node_pub,
                        "channel": "N/A",
                        "state": "Forced Closing (" + value.blocks_til_maturity + " blocks)",
                        "balance": value.channel.local_balance / config.get("unitrate"),
                        "capacity": value.channel.capacity / config.get("unitrate"),
                        "channelpoint": value.channel.channel_point
                    });
                });
                logger.silly(_this._userid, "lnd.channels succeeded.");
                callback(channels);
            });
        });
    };
    // PRIVATE METHODS
    LNDLighting.prototype._getConnection = function (port) {
        var fs = require("fs");
        var lndCert = fs.readFileSync(config.get("cert"));
        var credentials = grpc.credentials.createSsl(lndCert);
        var lnrpc = grpc.load("./config/rpc.proto").lnrpc;
        var lightning = new lnrpc.Lightning(config.get("rpcserver") + ":" + port, credentials);
        // TODO: add macaroon support.
        // let metadata = new grpc.Metadata();
        // var macaroonHex = fs.readFileSync(config.get("macaroon")).toString("hex");
        // metadata.add('macaroon', macaroonHex);
        return lightning;
    };
    LNDLighting.prototype._opennewpeer = function (pubkey, host, amount) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this._lightning.ConnectPeer({ "addr": { "pubkey": pubkey, "host": host } }, function (err, response) {
                if (err != null) {
                    logger.error(_this._userid, "lnd._opennewpeer failed: " + JSON.stringify(err));
                    reject({ "error": { "message": err } });
                }
                else
                    _this._opennewchannel(response.peer_id, pubkey, amount)
                        .then(function (response) { return resolve(response); })
                        .catch(function (err) { return reject(err); });
            });
        });
    };
    LNDLighting.prototype._opennewchannel = function (peerid, pub_key, amount) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var pub_key_bytes = ByteBuffer.fromHex(pub_key);
            _this._lightning.OpenChannelSync({
                "target_peer_id": peerid,
                "node_pubkey": pub_key_bytes,
                "node_pubkey_string": pub_key,
                "local_funding_amount": amount
            }, function (err, response) {
                if (err != null) {
                    logger.error(_this._userid, "lnd._opennewchannel failed: " + JSON.stringify(err));
                    reject({ "error": { "message": err } });
                }
                else {
                    _this._refresh();
                    resolve({ response: response });
                }
            });
        });
    };
    return LNDLighting;
}());
exports.default = LNDLighting;
