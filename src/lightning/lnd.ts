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

const spawn = require('child_process').spawn;

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
  private _lnd = null;
  private _unitrate = 1;
  private _ishub = false;

  constructor(id, rpcport, peerport, ishub) {
    this._userid = id;
    this._peerport = peerport;
    this._hasupdate = false;
    this._newtransactions = [];
    this._newchannels = [];
    this._quickpaynodes = {};
    this._unitrate = 1/config.get("unitrate");

    this._readjson(`./db/${this._userid}/balances.json`).then((balances: any) => {
      this._unitrate = balances.tusd;
    });

    var args = [
      '--rpcport', rpcport,
      '--peerport', this._peerport,
      '--restport', rpcport-2000,
      '--datadir',`../dist/db/${this._userid}/test_data`,
      '--logdir',`../dist/db/${this._userid}/test_log`,
      '--debuglevel', 'warn',
      '--bitcoin.testnet',
      '--bitcoin.active'
    ];

    if(ishub == false) {
      // Don't bootstrap for spokes.  Rely on hub.
      args.push("--nobootstrap");
    }
    else {
      this._ishub = true;
      // Enable autopilot for the hub.
      args.push("--autopilot.active")
      args.push(`--externalip=${config.get("externalip")}`)
    }

    // Spawn lnd instance.
    this._lnd = spawn(`../bin/lnd.exe`, args);

    // Create new files if they don't exist.
    fs.writeFileSync(`../dist/db/${this._userid}/lnd.log`, "");
    fs.writeFileSync(`../dist/db/${this._userid}/lnd.err`, "");

    this._lnd.stdout.on('data', (data) => {
      fs.appendFileSync(`../dist/db/${this._userid}/lnd.log`, data);
    });

    this._lnd.stderr.on('data', (data) => {
      fs.appendFileSync(`../dist/db/${this._userid}/lnd.err`, data);
    });

    this._lightning = this._getConnection(rpcport);

    // Wait 4 seconds for the lnd node to start.
    setTimeout(() => {
      // Set the alias for the hub.
      if(this._ishub == true) {
        this._lightning.setAlias({"new_alias": config.get("alias")}, (err, response) => {
          if(err != null) {
            logger.verbose(this._userid, "Set alias failed:", err);
          }
          else {
            logger.verbose(this._userid, "Set node alias to: ", config.get("alias"))
          }
        });
      }

      if(!fs.existsSync('./db/'+this._userid+'/contacts.json')) {
        this._quickpaynodes = {};
        this._refresh();
      }
      else {
        fs.readFile('./db/'+this._userid+'/contacts.json', 'utf8', (err, data) => {
          if (err) throw err;
          this._quickpaynodes = JSON.parse(data);
          this._refresh();
        });
        logger.debug(this._userid, "Loaded contacts")
      }
      setInterval(() => {this._refresh();}, 60000);

      // Subscribe to invoices.
      var invoices = this._lightning.subscribeInvoices({});
      invoices.on('data', (message) => {
        this._newtransactions.push(
        {
          "type": "Invoice",
          "memo": message.memo,
          "value": message.value*this._unitrate,
          "payment_request": message.payment_request
        });
        logger.verbose(this._userid, "Detected a new payment.")
        logger.debug(JSON.stringify(message));
        setTimeout(() => {this._refresh()}, 3000);
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
              "capacity": parseInt(value.capacity)*this._unitrate,
              "remotenode": value.connecting_node
            });
            shouldrefresh = true;
            logger.info(this._userid, "Detected a new channel opening.")
            logger.debug(this._userid, "Response: ", JSON.stringify(value));
          }
        });
        if(shouldrefresh)
          setTimeout(() => {this._refresh()}, 3000);
      });
      channels.on('end', function() {
        // The server has finished sending
        console.log("END");
      });
      channels.on('status', function(status) {
        // Process status
        console.log("Current status: " + status);
      });
    }, 4000);
  }

  ////////////////////////////////
  // ILightning Implementation
  ////////////////////////////////
  public Close()
  {
    grpc.closeClient(this._lightning);
    this._lnd.kill();
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
      var call = this._lightning.SendPaymentSync({"dest": dest, "amt": (amt/this._unitrate), "payment_hash_string": payment_hash}, (err, response) => {
        if(err != null) {
          logger.error(this._userid, "lnd.sendpayment failed: " + JSON.stringify(err));
          reject({"error":{"message":err}});
        }
        else {
          logger.debug(this._userid, "lnd.sendpayment succeeded.");
          setTimeout(() => {this._refresh()}, 3000);
          resolve({});
        }
      });
    });
  }

  public SendInvoice(invoiceid: string, alias: string): Promise<any> {
    return new Promise((resolve, reject) => {
      invoiceid = invoiceid.replace("lightning:", "");
      var nodepath = invoiceid.split("@");
      var pay_req = nodepath[0];

      var dopayment = () => {
        logger.verbose(this._userid, "lnd.sendinvoice started to send invoice.");
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
            setTimeout(() => {this._refresh()}, 3000);
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
            fs.writeFileSync(dir+'contacts.json', JSON.stringify(this._quickpaynodes, null, 2));
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
      this._lightning.AddInvoice({"memo": memo, "value": (amount/this._unitrate)}, (err, response) => {
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

  public GetInvoiceDetails(payment_request: string): Promise<any> {
    return new Promise((resolve, reject) => {
      payment_request = payment_request.replace("lightning:", "");
      this._lightning.decodePayReq({"pay_req": payment_request}, (err, response) => {
        if(err != null) {
          logger.error(this._userid, "lnd.getinvoicedetails failed: " + JSON.stringify(err));
          reject({"error":{"message":err.message}});
        }
        resolve(
        {
          "destination": response.destination,
          "amount": response.num_satoshis*this._unitrate,
          "timestamp": response.timestamp,
          "memo": response.description
        });
      });
    });
  }

  public AddContact(alias: string, nodeid: string, server: string): Promise<any> {
    return new Promise((resolve, reject) => {
      // strip nodepath.
      var nodepath = nodeid.split("@");

      // Add contact to address book with alias.
      if(nodepath.length < 2) {
        logger.error(this._userid, "lnd.addcontact failed with invalid nodeid.");
        logger.info(alias, "/", nodeid, "/", server)
        reject();
      }
      else {
        // Set server if specified.
        this._quickpaynodes[nodepath[0]] = {"alias": alias, "server": server, "channelserver": nodepath[1]};

        var dir = './db/'+this._userid+'/';
        fs.writeFileSync(dir+'contacts.json', JSON.stringify(this._quickpaynodes, null, 2));

        setTimeout(() => {this._refresh()}, 3000);
        resolve();
      }
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
            else {
              logger.info(this._userid, "lnd.openchannel calling open new peer.");
              this._opennewpeer(nodepath[0],nodepath[1],(amount/this._unitrate))
                .then((response) => resolve(response))
                .catch((err) => reject(err));
            }
          }
          else {
            this._opennewchannel(peerid, nodepath[0], (amount/this._unitrate))
              .then((response) => resolve(response))
              .catch((err) => reject(err));
          }
        }
      })
    });
  }

  public Reconnect(nodeid: string): Promise<any>
  {
    return new Promise((resolve, reject) => {
      var nodepath = nodeid.split("@");
      logger.info(this._userid, "lnd.reconnect called for: " + nodepath[0]);
      this._lightning.ConnectPeer({"addr": {"pubkey": nodepath[0], "host": nodepath[1]}}, (err, response) => {
        if(err != null) {
          logger.error(this._userid, "lnd.reconnect failed: " + JSON.stringify(err));
          reject({"error":{"message":err}});
        }
        else
          resolve(response);
      });
    });
  }

  public CloseChannel(channelid: string, force: boolean): Promise<any>
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

            if(force == true)
              logger.verbose(this._userid, "Forcing channel closed.");
            var call = this._lightning.CloseChannel(
            {
              "channel_point":
              {
                "funding_txid": ByteBuffer.fromHex(channel_point[0]).reverse(),
                "output_index": parseInt(channel_point[1])
              },
              "force": force
            });

            call.on('data', (message) => {
              logger.info(this._userid, "lnd.closechannel succeeded.  Channel closed.");
              setTimeout(() => {this._refresh()}, 3000);
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

  private _updateContactStatus(contacts) : Promise<any> {
    return new Promise((resolve, reject) => {
      var keys = Object.keys(contacts);
      for(var i=0;i<keys.length;i++){
        contacts[keys[i]].status = "Disconnected";
      }
      // List peers
      this._lightning.listPeers({}, (err, response) => {
        if(err != null) {
          logger.error(this._userid, "lnd._updateContactStatus failed on listPeers: " + JSON.stringify(err));
          reject({"error":{"message":err.message}});
        }
        else {
          response.peers.forEach((value) => {
            var contact = contacts[value.pub_key];
            if(contact != null)
              contact.status = "Connected"
          });
          resolve(contacts);
        }
      })
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

      this._updateContactStatus(this._quickpaynodes).then((contacts) => {
        this._quickpaynodes = contacts;
        fs.writeFileSync(dir+'contacts.json', JSON.stringify(contacts))
        local._hasupdate = true;
      });

      this._getinfo((response) => {
        try {
          local._pubkey = response.nodeId;
          fs.writeFileSync(dir+'info.json', JSON.stringify(response));

          local._getbalance((balance) => {
            local._getfunds((funds) => {
              var balances = {
                "btcfunds": (balance+funds)*this._unitrate,
                "lntfunds": funds*this._unitrate,
                "tusd": 0,
                "tgbp": 0,
                "teur": 0
              };
              fs.writeFileSync(dir+'balances.json', JSON.stringify(balances));

              // Grap conversion rates.
              request({
                url: "https://api.coindesk.com/v1/bpi/currentprice.json",
                method: "GET",
                json: true,   // <--Very important!!!
                },
                (error, response, body) => {
                  if(error != null) {
                    logger.error(this._userid, "Grabing current price failed.  Error code:" + error);
                  }
                  else {
                    var unitrate = 1/100000000;
                    balances.tusd = response.body.bpi.USD.rate_float*unitrate;
                    balances.tgbp = response.body.bpi.GBP.rate_float*unitrate;
                    balances.teur = response.body.bpi.EUR.rate_float*unitrate;
                    this._unitrate = balances.tusd;

                    fs.writeFileSync(dir+'balances.json', JSON.stringify(balances));
                  }
                });

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
          local._hasupdate = true;
          logger.error(this._userid, "Failed to refresh information with error: " + e.message)
        }

      });
    } catch (e) {
      local._hasupdate = true;
      logger.error(this._userid, "Failed to refresh information with error: " + e.message)
    }
  }

  private _getaddress(callback) {
    this._lightning.NewAddress({"type": 1}, (err, response) => {
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
      callback(parseInt(response.total_balance));
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
      var addresscode = `${response.identity_pubkey}@${config.get("netip")}:${this._peerport}@${config.get("webserver")}:${config.get("webport")}`;

      var info =
      {
        "nodeId": response.identity_pubkey,
        "alias": config.get("netip"),
        "port": this._peerport,
        "synchronized": response.synced_to_chain,
        "blockheight": response.block_height,
        "addresscode": addresscode
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
          "amount": value.amount*this._unitrate,
          "num_confirmations": value.num_confirmations,
          "time_stamp": value.time_stamp,
          "total_fees": value.total_fees*this._unitrate
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
          "amount": value.value*this._unitrate,
          "num_confirmations": 0,
          "time_stamp": value.creation_date,
          "total_fees": value.fee*this._unitrate
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
            "amount": value.value*this._unitrate,
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
          "balance": value.local_balance*this._unitrate,
          "capacity": value.capacity*this._unitrate,
          "channelpoint": value.channel_point,
          "waitblocks": 0,
          "active": value.active
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
            "balance": value.channel.local_balance*this._unitrate,
            "capacity": value.channel.capacity*this._unitrate,
            "channelpoint": value.channel.channel_point,
            "waitblocks": value.blocks_till_open,
            "active": true
          });
        });
        response.pending_closing_channels.forEach((value) => {
          channels.push(
          {
            "node": value.channel.remote_node_pub,
            "channel": "N/A",
            "state": "Closing",
            "balance": value.channel.local_balance*this._unitrate,
            "capacity": value.channel.capacity*this._unitrate,
            "channelpoint": value.channel.channel_point,
            "waitblocks": 0,
            "active": true
          });
        });
        response.pending_force_closing_channels.forEach((value) => {
          channels.push(
          {
            "node": value.channel.remote_node_pub,
            "channel": "N/A",
            "state": "Forced Closing ("+value.blocks_til_maturity+" blocks)",
            "balance": value.channel.local_balance*this._unitrate,
            "capacity": value.channel.capacity*this._unitrate,
            "channelpoint": value.channel.channel_point,
            "waitblocks": value.blocks_til_maturity,
            "active": true
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
      logger.info(this._userid, "lnd._opennewpeer called for: " + pubkey);
      this._lightning.ConnectPeer({"addr": {"pubkey": pubkey, "host": host}}, (err, response) => {
        if(err != null) {
          logger.error(this._userid, "lnd._opennewpeer failed: " + JSON.stringify(err));
          reject({"error":{"message":err}});
        }
        else {
          logger.info(this._userid, "lnd._opennewpeer calling open new channel: " + pubkey);
          this._opennewchannel(response.peer_id, pubkey, amount)
            .then((response) => resolve(response))
            .catch((err) => reject(err));
        }
      });
    });
  }

  private _opennewchannel(peerid: number, pub_key: string, amount: number): Promise<any> {
    return new Promise((resolve, reject) => {
      var pub_key_bytes = ByteBuffer.fromHex(pub_key);
      logger.info(this._userid, "lnd._opennewchannel called for peerid: " + peerid);
      this._lightning.OpenChannelSync(
        {
          "target_peer_id": peerid,
          "node_pubkey": pub_key_bytes,
          "node_pubkey_string": pub_key,
          "local_funding_amount": amount
        }, (err, response) => {
          if(err != null) {
            logger.error(this._userid, "lnd._opennewchannel failed: " + JSON.stringify(err));
            reject({"error":{"message":err}});
          }
          else {
            setTimeout(() => {this._refresh()}, 3000);
            logger.info(this._userid, "lnd._opennewchannel succeeded: " + peerid);
            resolve({response});
          }
      });
    });
  }

  private _readjson(path: string)
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
}
