"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var lnd_1 = require("./lnd");
var LightningFactory = /** @class */ (function () {
    function LightningFactory() {
    }
    LightningFactory.getLightning = function (userid, rpcport, peerport) {
        // TODO: instance class per config.
        var node = new lnd_1.default(userid, rpcport, peerport);
        return node;
    };
    return LightningFactory;
}());
exports.LightningFactory = LightningFactory;
