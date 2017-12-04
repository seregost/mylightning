'use strict'
import logger = require("../utilities/logger");

import {ILightning} from './lightning'
const request = require('request');
const bitcoin = require('bitcoin');
const _ = require('lodash');
const config = require('config');
const ByteBuffer = require('bytebuffer');
const qr = require('qr-image');
const fs = require('fs');
const sortJsonArray = require('sort-json-array');
const grpc = require('grpc');

// sudo sysctl -w net.ipv4.conf.p4p1.route_localnet=1
// sudo iptables -t nat -I PREROUTING -p tcp -d 192.168.2.0/24 --dport 10001 -j DNAT --to-destination 127.0.0.1:10001

export default class LNDLighting implements ILightning {
  private _userid: string;
  private _pubkey: string;
  private _hasupdate: boolean;
  private _lightning: any;
  private _newtransactions: Array<any>;
  private _newchannels: Array<any>;
  private _peerport: number;
  private _quickpaynodes: any;

  constructor(id, rpcport, peerport) {
    this._userid = id;
    this._hasupdate = false;
    this._lightning = this._getConnection(rpcport);
    this._newtransactions = [];
    this._newchannels = [];
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
      logger.debug(this._userid, "Loaded quickpaynodes")
    }

    this._refresh();

    setInterval(() => {this._refresh();}, 10000);

    // Subscribe to invoices.
    var invoices = this._lightning.subscribeInvoices({});
    invoices.on('data', (message) => {
      this._newtransactions.push(
      {
        "type": "Invoice",
        "memo": message.memo,
        "value": message.value/config.get("unitrate"),
        "payment_request": message.payment_request
      });
      logger.verbose(this._userid, "Detected a new payment.")
      logger.debug(JSON.stringify(message));
      this._refresh();
    });
    invoices.on('end', function() {
      // The server has finished sending
      console.log("END");
    });
    invoices.on('status', function(status) {
      // Process status
      console.log("Current status: " + status);
    });

    // Subscribe to channel graph changes.
    var channels = this._lightning.subscribeChannelGraph({});
    channels.on('data', (message) => {
      var shouldrefresh: boolean = false;
      message.channel_updates.forEach((value) => {
        // If we are the recipient of the new channel.
        if(value.advertising_node == this._pubkey) {
          this._newchannels.push(
          {
            "channelid": value.chan_id,
            "channelpoint": value.chan_point,
            "capacity": parseInt(value.capacity)/config.get("unitrate"),
            "remotenode": value.connecting_node
          });
          shouldrefresh = true;
          logger.info(this._userid, "Detected a new channel opening.")
          logger.debug(this._userid, "Response: ", JSON.stringify(value));
        }
      });
      if(shouldrefresh)
        this._refresh();
    });
    channels.on('end', function() {
      // The server has finished sending
      console.log("END");
    });
    channels.on('status', function(status) {
      // Process status
      console.log("Current status: " + status);
    });
  }

  ////////////////////////////////
  // ILightning Implementation
  ////////////////////////////////
  public Close()
  {
    grpc.closeClient(this._lightning);
  }

  public get ShouldUpdate(): boolean {
    if(this._hasupdate == true)
    {
      this._hasupdate = false;
      return true;
    }
  }

  public get NewTransactions(): Array<any> {
    if(this._newtransactions.length > 0)
    {
      var temp = this._newtransactions;
      this._newtransactions = []
      return temp;
    }
    return [];
  }

  public get NewChannels(): Array<any> {
    if(this._newchannels.length > 0)
    {
      var temp = this._newchannels;
      this._newchannels = []
      return temp;
    }
    return [];
  }

  public get PubKey(): string {
    return this._pubkey;
  }

  public SendPayment(pub_key: string, amt: number, payment_hash: string): Promise<any> {
    return new Promise((resolve, reject) => {
      var dest = ByteBuffer.fromHex(pub_key);
      var payhash = ByteBuffer.fromHex(payment_hash);
      var call = this._lightning.SendPaymentSync({"dest": dest, "amt": (amt*config.get("unitrate")), "payment_hash_string": payment_hash}, (err, response) => {
        if(err != null) {
          logger.error(this._userid, "lnd.sendpayment failed: " + JSON.stringify(err));
          reject({"error":{"message":err}});
        }
        else {
          logger.debug(this._userid, "lnd.sendpayment succeeded.");
          resolve({});
        }
      });
    });
  }

  public SendInvoice(invoiceid: string, alias: string): Promise<any> {
    return new Promise((resolve, reject) => {
      var nodepath = invoiceid.split("@");
      var pay_req = nodepath[0];

      var dopayment = () => {
        this._lightning.SendPaymentSync({"payment_request": pay_req}, (err, response) => {
          if(err != null) {
            logger.error(this._userid, "lnd.sendinvoice failed: ", JSON.stringify(err));
            reject({"error":{"message":err.message}});
          }
          else if(response.payment_error != null && response.payment_error.length > 0) {
            logger.error(this._userid, "lnd.sendinvoice failed: ", JSON.stringify(response));
            reject({"error":{"message":response.payment_error}});
          }
          else {
            logger.debug(this._userid, "lnd.sendinvoice succeeded.");
            this._refresh();
            resolve({});
          }
        });
      }
      if(nodepath.length > 1) {
        this._lightning.decodePayReq({"pay_req": pay_req}, (err, response) => {
          if(err != null) {
            logger.error(this._userid, "lnd.decodePayReq failed: " + JSON.stringify(err));
            reject({"error":{"message":err.message}});
          }
          if(alias != null) {
            this._quickpaynodes[response.destination] = {"alias": alias, "server": nodepath[1]};
            var dir = './db/'+this._userid+'/';
            fs.writeFileSync(dir+'quickpaynodes.json', JSON.stringify(this._quickpaynodes, null, 2));
            logger.verbose(this._userid, "lnd.sendinvoice added new quickpaynode for pub_key: ", response.destination);
            dopayment();
          }
        });
      }
      else {
        dopayment();
      }
    });
  }

  public QuickPay(pub_key: string, amount: number, memo: string): Promise<any> {
    return new Promise((resolve, reject) => {
      var server = this._quickpaynodes[pub_key].server;

      if(server == null) {
        logger.error(this._userid, "lnd.quickpay failed to find server for pub_key: ", pub_key);
        reject({"error":{"message":"Cannot find address to request invoice."}});
      }
      else {
        var request = require('request');
        request({
          uri: `https://${server}/rest/v1/requestinvoice`,
          method: "POST",
          agentOptions: {
              rejectUnauthorized: false
          },
          json: true,
          body: { "pub_key": pub_key, "amount": amount, "memo": memo }
          },
          (error, response, body) => {
            if(error != null) {
              logger.error(this._userid, "lnd.quickpay requestinvoice failed with response: ", error.message);
              reject({"error":{"message":error.message}});
            }
            else if(body.error != null)
            {
              logger.error(this._userid, "lnd.quickpay requestinvoice failed with response: ", body.error.message);
              reject({"error":{"message":body.error.message}});
            }
            else {
              logger.debug(this._userid, "lnd.quickpay succeeded.");
              this.SendInvoice(body.payment_request, "")
                .then((response) => resolve(response))
                .catch((err) => reject(err));
            }
        });
      }
    });
  }

  public CreateInvoice(memo: string, amount: number, quickpay: boolean): Promise<any> {
    return new Promise((resolve, reject) => {
      this._lightning.AddInvoice({"memo": memo, "value": (amount*config.get("unitrate"))}, (err, response) => {
        if(err != null) {
          logger.error(this._userid, "lnd.createinvoice failed: " + JSON.stringify(err));
          reject({"error":{"message":err.message}});
        }
        else {
          var quickpay_request = `${response.payment_request}@${config.get("webserver")}:${config.get("webport")}`;

          if(quickpay == true) {
            response.payment_request = quickpay_request;
          }
          logger.debug(this._userid, "lnd.createinvoice succeeded.");
          resolve(response);
        }
      });
    });
  }

  public OpenChannel(nodeid: string, amount: number): Promise<any> {
    return new Promise((resolve, reject) => {
      var nodepath = nodeid.split("@");

      // List peers
      this._lightning.listPeers({}, (err, response) => {
        if(err != null) {
          logger.error(this._userid, "lnd.openchannel failed on listPeers: " + JSON.stringify(err));
          reject({"error":{"message":err.message}});
        }
        else {
          var peerid = -1;
          response.peers.forEach((value) => {
            if(value.pub_key == nodepath[0]) {
              peerid = value.peer_id;
              return false;
            }
          });

          if(peerid == -1) {
            if(nodepath.length < 2)
            {
              logger.error(this._userid, "lnd.openchannel failed.  No peer found, so must specify a host name.");
              resolve({"error":{"message":"No peer found, so must specify a host name."}});
            }
            else
              this._opennewpeer(nodepath[0],nodepath[1],(amount*config.get("unitrate")))
                .then((response) => resolve(response))
                .catch((err) => reject(err));
          }
          else {
            this._opennewchannel(peerid, nodepath[0], (amount*config.get("unitrate")))
              .then((response) => resolve(response))
              .catch((err) => reject(err));
          }
        }
      })
    });
  }

  public CloseChannel(channelid: string): Promise<any>
  {
    return new Promise((resolve, reject) => {
      try {
        this._lightning.GetChanInfo({"chan_id": channelid}, (err,response) => {
          if(err != null) {
            logger.error(this._userid, "lnd.closechannel failed on GetChanInfo: " + JSON.stringify(err));
            reject({"error":{"message":err.message}});
          }
          else {
            logger.verbose(this._userid, "Channel point to close: ", response.chan_point);

            var channel_point = response.chan_point.split(':');

            var call = this._lightning.CloseChannel(
            {
              "channel_point":
              {
                "funding_txid": ByteBuffer.fromHex(channel_point[0]).reverse(),
                "output_index": parseInt(channel_point[1])
              }
            });

            call.on('data', (message) => {
              logger.info(this._userid, "lnd.closechannel succeeded.  Channel closed.");
              resolve(message);
            });

            call.on('error', (err) => {
              // The server has finished sending
              logger.error(this._userid, "lnd.closechannel failed: " + err.message);
              reject({"error":{"message":err}});
            });
          }
        });
      }
      catch(e) {
        logger.error(this._userid, "lnd.closechannel failed.  Error code:" + e);
        reject({"error":{"message":e}});
      }
    });
  }

  private _refresh(): void {
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
        this._getaddress(function(response) {
          fs.writeFileSync(dir+'address.json', JSON.stringify(response))
        });
      }
      this._getinfo((response) => {
        try {
          local._pubkey = response.nodeId;
          fs.writeFileSync(dir+'info.json', JSON.stringify(response));

          local._getbalance((balance) => {
            local._getfunds((funds) => {
              var balances = {
                "btcfunds": (balance+funds)/config.get("unitrate"),
                "lntfunds": funds/config.get("unitrate")
              };
              fs.writeFileSync(dir+'balances.json', JSON.stringify(balances));

              local._channels((channels) => {
                sortJsonArray(channels, 'channel');
                fs.writeFileSync(dir+'channels.json', JSON.stringify(channels));

                local._gettransactions((transactions) => {
                  local._getpayments((payments) => {
                    local._getsettledinvoices((invoices) => {
                      if(payments.error == null)
                        transactions = transactions.concat(payments);
                      if(invoices.error == null)
                        transactions = transactions.concat(invoices);

                      sortJsonArray(transactions, 'time_stamp', 'des');
                      transactions = transactions.slice(0,50);
                      fs.writeFileSync(dir+'transactions.json', JSON.stringify(transactions));

                      local._hasupdate = true;
                    });
                  });
                });
              });
            });
          });
        }
        catch (e) {
          logger.error(this._userid, "Failed to refresh information with error: " + e.message)
        }

      });
    } catch (e) {
      logger.error(this._userid, "Failed to refresh information with error: " + e.message)
    }
  }

  private _getaddress(callback) {
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

  private _getbalance(callback) {
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

  private _getfunds(callback) {
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

  private _getinfo(callback) {
    this._lightning.GetInfo({}, (err, response) => {
      if(err != null) {
        logger.error(this._userid, "lnd.getinfo failed: " + JSON.stringify(err));
        callback({"error":{"message":err}});
        return;
      }
      var info =
      {
        "nodeId": response.identity_pubkey,
        "alias": config.get("netip"),
        "port": this._peerport,
        "synchronized": response.synced_to_chain,
        "blockheight": response.block_height
      }
      logger.silly(this._userid, "lnd.getinfo succeeded.");
      callback(info);
    });
  }

  private _gettransactions(callback) {
    this._lightning.getTransactions({}, (err, response) => {
      if(err != null) {
        logger.error(this._userid, "lnd._gettransactions failed: " + JSON.stringify(err));
        callback({"error":{"message":err}});
        return;
      }
      var transactions = [];
      response.transactions.forEach((value) => {
        transactions.push(
        {
          "hash": value.tx_hash,
          "type": "transaction",
          "amount": value.amount/config.get("unitrate"),
          "num_confirmations": value.num_confirmations,
          "time_stamp": value.time_stamp,
          "total_fees": value.total_fees/config.get("unitrate")
        });
      });
      logger.silly(this._userid, "lnd._gettransactions succeeded.");
      callback(transactions);
    });
  }

  private _getpayments(callback) {
    this._lightning.listPayments({}, (err, response) => {
      if(err != null) {
        logger.error(this._userid, "lnd._getpayments failed: " + JSON.stringify(err));
        callback({"error":{"message":err}});
        return;
      }
      var payments = [];
      response.payments.forEach((value) => {
        payments.push(
        {
          "hash": value.payment_hash,
          "type": "payment",
          "amount": value.value/config.get("unitrate"),
          "num_confirmations": 0,
          "time_stamp": value.creation_date,
          "total_fees": value.fee/config.get("unitrate")
        });
      });
      logger.silly(this._userid, "lnd._getpayments succeeded.");
      callback(payments);
    });
  }

  private _getsettledinvoices(callback) {
    this._lightning.listInvoices({}, (err, response) => {
      if(err != null) {
        logger.debug(this._userid, "lnd._getsettledinvoices failed: " + JSON.stringify(err));
        callback({"error":{"message":err}});
        return;
      }
      var invoices = [];
      response.invoices.forEach((value) => {
        if(value.settled == true) {
          invoices.push(
          {
            "hash": value.payment_request,
            "type": "invoice",
            "amount": value.value/config.get("unitrate"),
            "num_confirmations": 0,
            "time_stamp": value.creation_date,
            "total_fees": 0,
            "memo": value.memo
          });
          logger.silly(this._userid, "Found settled invoice.");
        }
      });
      callback(invoices);
    });
  }

  private _channels(callback) {
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
          "balance": value.local_balance/config.get("unitrate"),
          "capacity": value.capacity/config.get("unitrate"),
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
            "balance": value.channel.local_balance/config.get("unitrate"),
            "capacity": value.channel.capacity/config.get("unitrate"),
            "channelpoint": value.channel.channel_point
          });
        });
        response.pending_closing_channels.forEach((value) => {
          channels.push(
          {
            "node": value.channel.remote_node_pub,
            "channel": "N/A",
            "state": "Closing",
            "balance": value.channel.local_balance/config.get("unitrate"),
            "capacity": value.channel.capacity/config.get("unitrate"),
            "channelpoint": value.channel.channel_point
          });
        });
        response.pending_force_closing_channels.forEach((value) => {
          channels.push(
          {
            "node": value.channel.remote_node_pub,
            "channel": "N/A",
            "state": "Forced Closing ("+value.blocks_til_maturity+" blocks)",
            "balance": value.channel.local_balance/config.get("unitrate"),
            "capacity": value.channel.capacity/config.get("unitrate"),
            "channelpoint": value.channel.channel_point
          });
        });
        logger.silly(this._userid, "lnd.channels succeeded.");
        callback(channels);
      });
    });
  }

  // PRIVATE METHODS
  private _getConnection(port)
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

  private _opennewpeer(pubkey: string, host: string, amount: number): Promise<any> {
    return new Promise((resolve, reject) => {
      this._lightning.ConnectPeer({"addr": {"pubkey": pubkey, "host": host}}, (err, response) => {
        if(err != null) {
          logger.error(this._userid, "lnd._opennewpeer failed: " + JSON.stringify(err));
          reject({"error":{"message":err}});
        }
        else
          this._opennewchannel(response.peer_id, pubkey, amount)
            .then((response) => resolve(response))
            .catch((err) => reject(err));
      });
    });
  }

  private _opennewchannel(peerid: number, pub_key: string, amount: number): Promise<any> {
    return new Promise((resolve, reject) => {
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
            logger.error(this._userid, "lnd._opennewchannel failed: " + JSON.stringify(err));
            reject({"error":{"message":err}});
          }
          else {
            this._refresh();
            resolve({response});
          }
      });
    });
  }
}
