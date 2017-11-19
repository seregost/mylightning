'use strict'
// npm install request
const request = require('request');
const bitcoin = require('bitcoin');
const _ = require('lodash');
const config = require('config');
const ByteBuffer = require('bytebuffer');
const qr = require('qr-image');
const fs = require('fs');
const sortJsonArray = require('sort-json-array');
const logger = require("../logger");
const grpc = require('grpc');

// sudo sysctl -w net.ipv4.conf.p4p1.route_localnet=1
// sudo iptables -t nat -I PREROUTING -p tcp -d 192.168.2.0/24 --dport 10001 -j DNAT --to-destination 127.0.0.1:10001

module.exports = class Lighting {
  constructor(id, rpcport, peerport) {
    this._userid = id;
    this._hasupdate = false;
    this._lightning = this._getConnection(rpcport);
    this._newtransactions = [];
    this._peerport = peerport;
    this._quickpaynodes = {};

    if(!fs.existsSync('./db/'+this._userid+'/quickpaynodes.json'))
    {
      this._quickpaynodes = {};
    }
    else
    {
      fs.readFile('./db/'+this._userid+'/quickpaynodes.json', 'utf8', (err, data) => {
        if (err) throw err;
        this._quickpaynodes = JSON.parse(data);
      });
      logger.verbose(this._userid, "Loaded quickpaynodes")
    }

    this.refreshChannels();

    setInterval(() => {this.refreshChannels();}, 10000);

    // Subscribe to invoices.
    var call = this._lightning.subscribeInvoices({});
    call.on('data', (message) => {
      this._newtransactions.push(
      {
        "type": "Invoice",
        "memo": message.memo,
        "value": message.value/100000,
        "payment_request": message.payment_request
      });
      logger.verbose(this._userid, "Detected a new payment.")
      logger.debug(JSON.stringify(message));
      this.refreshChannels();
    });
    call.on('end', function() {
      // The server has finished sending
      console.log("END");
    });
    call.on('status', function(status) {
      // Process status
      console.log("Current status: " + status);
    });
  }

  close()
  {
    grpc.closeClient(this._lightning);
  }

  refreshChannels() {
    try {
      var channels = [];
      var test = [];
      var dir = './db/'+this._userid+'/';
      var local = this;

      if (!fs.existsSync(dir)){
        fs.mkdirSync(dir);
      }

      if(!fs.existsSync(dir+'/address.json'))
      {
        // Get a new bitcoin segwit address
        this.getaddress(function(response) {
          fs.writeFileSync(dir+'address.json', JSON.stringify(response))
        });
      }
      this.getinfo((response) => {
        try {
          local._pubkey = response.result.nodeId;
          fs.writeFileSync(dir+'info.json', JSON.stringify(response));

          local.getbalance((balance) => {
            local.getfunds((funds) => {
              var balances = {
                "btcfunds": balance+funds,
                "lntfunds": funds
              };
              fs.writeFileSync(dir+'balances.json', JSON.stringify(balances));

              local.channels((channels) => {
                sortJsonArray(channels, 'channel');
                fs.writeFileSync(dir+'channels.json', JSON.stringify(channels));
                local._hasupdate = true;
              });
            });
          });
        }
        catch (e) {
          logger.error(this._userid, "Failed to refresh information with error: " + e.message)
        }
        // var qr_svg = qr.image(
        //   response.result.nodeId + "@" +
        //   response.result.alias + ".com:" +
        //   response.result.port, {type: 'png'});
        // qr_svg.pipe(require('fs').createWriteStream('serverqr.png'));
      });
    } catch (e) {
      logger.error(this._userid, "Failed to refresh information with error: " + e.message)
    }
  }

  shouldupdate() {
    if(this._hasupdate == true)
    {
      this._hasupdate = false;
      return true;
    }
  }

  newtransactions() {
    if(this._newtransactions.length > 0)
    {
      var temp = this._newtransactions;
      this._newtransactions = []
      return temp;
    }
    return [];
  }

  get pubkey() {
    return this._pubkey;
  }

  getaddress(callback) {
    this._lightning.NewWitnessAddress({}, (err, response) => {
      if(err != null) {
        logger.error(this._userid, "lnd.getaddress failed with error: " + JSON.stringify(err));
        callback({"error":{"message":err}});
        return;
      }
      logger.silly(this._userid, "lnd.getaddress succeeded.");
      callback(response.address);
    });
  }

  getbalance(callback) {
    this._lightning.WalletBalance({"witness_only": true }, (err, response) => {
      if(err != null) {
        logger.error(this._userid, "lnd.getbalance failed: " + JSON.stringify(err));
        callback({"error":{"message":err}});
        return;
      }
      logger.silly(this._userid, "lnd.getbalance succeeded.");
      callback(parseInt(response.balance));
    });
  }

  getfunds(callback) {
    this._lightning.ChannelBalance({}, (err, response) => {
      if(err != null) {
        logger.error(this._userid, "lnd.getfunds failed: " + JSON.stringify(err));
        callback({"error":{"message":err}});
        return;
      }
      logger.silly(this._userid, "lnd.getfunds succeeded.");
      callback(parseInt(response.balance));
    });
  }

  getinfo(callback) {
    this._lightning.GetInfo({}, (err, response) => {
      if(err != null) {
        logger.error(this._userid, "lnd.getinfo failed: " + JSON.stringify(err));
        callback({"error":{"message":err}});
        return;
      }
      var info =
      {
        "result": {
          "nodeId": response.identity_pubkey,
          "alias": config.get("netip"),
          "port": this._peerport,
          "synchronized": response.synced_to_chain,
          "blockheight": response.block_height
        }
      }
      logger.silly(this._userid, "lnd.getinfo succeeded.");
      callback(info);
    });
  }

  channels(callback) {
    var channels = [];
    this._lightning.ListChannels({}, (err, response) => {
      if(err != null) {
        logger.error(this._userid, "lnd.channels failed: " + JSON.stringify(err));
        callback({"error":{"message":err}});
      }
      response.channels.forEach((value) => {
        channels.push(
        {
          "node": value.remote_pubkey,
          "channel": value.chan_id,
          "state": "Open",
          "balance": value.local_balance/100000,
          "capacity": value.capacity/100000,
          "channelpoint": value.channel_point
        });
      });
      // Calcu pending channels also.
      this._lightning.PendingChannels({}, (err, response) => {
        if(err != null) {
          logger.error(this._userid, "lnd.pendingchannels failed: " + JSON.stringify(err));
          callback({"error":{"message":err}});
        }
        response.pending_open_channels.forEach((value) => {
          channels.push(
          {
            "node": value.channel.remote_node_pub,
            "channel": "N/A",
            "state": "Pending ("+value.blocks_till_open+" blocks)",
            "balance": value.channel.local_balance/100000,
            "capacity": value.channel.capacity/100000,
            "channelpoint": value.channel.channel_point
          });
        });
        response.pending_closing_channels.forEach((value) => {
          channels.push(
          {
            "node": value.channel.remote_node_pub,
            "channel": "N/A",
            "state": "Closing",
            "balance": value.channel.local_balance/100000,
            "capacity": value.channel.capacity/100000,
            "channelpoint": value.channel.channel_point
          });
        });
        response.pending_force_closing_channels.forEach((value) => {
          channels.push(
          {
            "node": value.channel.remote_node_pub,
            "channel": "N/A",
            "state": "Forced Closing ("+value.blocks_til_maturity+" blocks)",
            "balance": value.channel.local_balance/100000,
            "capacity": value.channel.capacity/100000,
            "channelpoint": value.channel.channel_point
          });
        });
        logger.silly(this._userid, "lnd.channels succeeded.");
        callback(channels);
      });
    });
  }

  sendpayment(pub_key, amt, r_hash, callback) {
    var dest = ByteBuffer.fromHex(pub_key);
    var payhash = ByteBuffer.fromHex(r_hash);
    var call = this._lightning.SendPaymentSync({"dest": dest, "amt": (amt*100000), "payment_hash_string": r_hash}, (err, response) => {
      if(err != null) {
        logger.error(this._userid, "lnd.sendpayment failed: " + JSON.stringify(err));
        callback({"error":{"message":err}});
        return;
      }
      else
        logger.debug(this._userid, "lnd.sendpayment succeeded.");
        callback(response);
    });
  }

  sendinvoice(invoiceid, alias, callback) {
    var nodepath = invoiceid.split("@");
    var pay_req = nodepath[0];
    var error = false;

    if(nodepath.length > 1) {
      this._lightning.decodePayReq({"pay_req": pay_req}, (err, response) => {
        if(err != null) {
          logger.error(this._userid, "lnd.decodePayReq failed: " + JSON.stringify(err));
          callback({"error":{"message":err.message}});
          error = true;
          return;
        }
        if(alias != null) {
          this._quickpaynodes[response.destination] = {"alias": alias, "server": nodepath[1]};
          var dir = './db/'+this._userid+'/';
          fs.writeFileSync(dir+'quickpaynodes.json', JSON.stringify(this._quickpaynodes));
          logger.verbose(this._userid, "lnd.sendinvoice added new quickpaynode for pub_key: " + response.destination);
        }
      });
    }
    if(!error) {
      var call = this._lightning.SendPaymentSync({"payment_request": pay_req}, (err, response) => {
        if(err != null) {
          logger.error(this._userid, "lnd.sendinvoice failed: " + JSON.stringify(err));
          callback({"error":{"message":err.message}});
          return;
        }
        logger.debug(this._userid, "lnd.sendinvoice succeeded.");
        this.refreshChannels();
        callback(response);
      });
    }
  }

  quickpay(pub_key, amount, memo, callback) {
    var server = this._quickpaynodes[pub_key].server;

    if(server == null) {
      logger.error(this._userid, "lnd.quickpay failed to find server for pub_key: " + pub_key);
      callback({"error":{"message":"Cannot find address to request invoice."}});
    }
    else {
      var request = require('request');
      request({
        uri: 'https://' + server + '/rest/v1/requestinvoice',
        method: "POST",
        agentOptions: {
            rejectUnauthorized: false
        },
        json: true,   // <--Very important!!!
        body: { "pub_key": pub_key, "amount": amount, "memo": memo }
        },
        (error, response, body) => {
          if(error != null) {
            logger.error(this._userid, "lnd.quickpay requestinvoice failed with response: " + error.message);
            callback({"error":{"message":error.message}});
          }
          logger.debug(this._userid, "lnd.quickpay succeeded.");
          this.sendinvoice(body.payment_request, "", callback);
      });
    }
  }

  createinvoice(memo, amount, quickpay, callback) {
    this._lightning.AddInvoice({"memo": memo, "value": (amount*100000)}, (err, response) => {
      if(err != null) {
        logger.error(this._userid, "lnd.createinvoice failed: " + JSON.stringify(err));
        callback({"error":{"message":err.message}});
      }
      else {
        var dir = './db/'+this._userid+'/';

        // Create invoice qr
        var qr_svg = qr.image(""+response.payment_request, {type: 'png'});
        qr_svg.pipe(require('fs').createWriteStream(dir + "latestinvoice.png"));

        var quickpay_request = ""+response.payment_request+"@"+config.get("webserver")+":"+config.get("webport");
        var qr_svg = qr.image(quickpay_request, {type: 'png'});
        qr_svg.pipe(require('fs').createWriteStream(dir + "latestinvoice_easy.png"));

        if(quickpay == true) {
          response.payment_request = quickpay_request;
        }
        logger.debug(this._userid, "lnd.createinvoice succeeded.");
        callback(response);
      }
    });
  }

  openchannel(nodeid, amount, callback) {
    var nodepath = nodeid.split("@");

    // List peers
    this._lightning.listPeers({}, (err, response) => {
      var peerid = -1;
      response.peers.forEach((value) => {
        if(value.pub_key == nodepath[0]) {
          peerid = value.peer_id;
          return false;
        }
      });

      if(peerid == -1) {
        this._opennewpeer(nodepath[0],nodepath[1],(amount*100000),callback)
      }
      else {
        this._opennewchannel(peerid, nodepath[0], (amount*100000),callback)
      }
    })
  }

  closechannel(channelid, callback)
  {
    this._lightning.GetChanInfo({"chan_id": channelid}, (err,response) => {
      var channel_point = response.chan_point.split(':');
      var call = this._lightning.CloseChannel(
        {
          "channel_point":
          {
            "funding_txid": ByteBuffer.fromHex(channel_point[0]),
            "output_index": parseInt(channel_point[1])
          }
        });

      call.on('data', function(message) {
        callback(message);
      });
    });

  }

  // PRIVATE METHODS
  _getConnection(port)
  {
    var fs = require("fs");

    var lndCert = fs.readFileSync(config.get("cert"));
    var credentials = grpc.credentials.createSsl(lndCert);
    var { lnrpc } = grpc.load("./config/rpc.proto");
    var lightning = new lnrpc.Lightning(config.get("rpcserver")+":"+port, credentials);

    // TODO: add macaroon support.
    // let metadata = new grpc.Metadata();
    // var macaroonHex = fs.readFileSync(config.get("macaroon")).toString("hex");
    // metadata.add('macaroon', macaroonHex);

    return lightning;
  }

  _opennewpeer(pubkey, host, amount, callback) {
    this._lightning.ConnectPeer({"addr": {"pubkey": pubkey, "host": host}}, (err, response) => {
      if(err != null) {
        callback({"error":{"message":err}});
      }
      else
        this._opennewchannel(response.peer_id, pubkey, amount, callback);
    });
  }

  _opennewchannel(peerid, pub_key, amount, callback) {
    var pub_key_bytes = ByteBuffer.fromHex(pub_key);

    this._lightning.OpenChannelSync(
      {
        "target_peer_id": peerid,
        "node_pubkey": pub_key_bytes,
        "node_pubkey_string": pub_key,
        "local_funding_amount": amount
      }, (err, response) => {
        if(err != null)
        {
          callback({"error":{"message":err}});
        }
        else {
          callback({response});
        }
    });
  }
}