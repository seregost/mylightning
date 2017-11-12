// npm install request
var request = require('request');
var bitcoin = require('bitcoin');

exports.getbalance = function(callback) {
  var client = new bitcoin.Client({
    host: 'dadserver',
    port: 18332,
    user: 'bitcoinrpc',
    pass: 'EqyZegw8t5AmVN6fxMxsV2xu9KZuVPPcGDsRM5EyoDeH'
  });
  client.getBalance(function(err, funds) {
    if (err) {
      return console.error(err);
    }
    callback(funds*1000);
  });
}

exports.getfunds = function(callback) {
  request({
    url: "http://dadserver:8082",
    method: "POST",
    json: true,   // <--Very important!!!
    body: { "method": "listfunds", "params": [] }
    },
    function (error, response, body){
      if (error) {
        return console.error(err);
      }
      var funds = 0
      $.each(body.outputs, function (key, value) {
        funds = funds + value.value;
      });
      callback(funds/100000);
  });
}

exports.getinfo = function(callback) {
  request({
    url: "http://dadserver:8082",
    method: "POST",
    json: true,   // <--Very important!!!
    body: { "method": "getinfo", "params": [] }
    },
    function (error, response, body){
      var response =
      {
        "result": {
          "nodeId": body.id,
          "alias": "seregost",
          "port": body.port
        }
      }
      callback(response);
  });
}

exports.channels = function(callback) {
  request({
    url: "http://dadserver:8082",
    method: "POST",
    json: true,   // <--Very important!!!
    body: { "method": "getpeers", "params": [] }
    },
    function (error, response, body){
      var channels = [];
      $.each(body.peers, function (key, value) {
        if(value.channel != null) {
          // TODO: Transform state to standard schema.
          channels.push(
          {
            "node": value.peerid,
            "channel": value.channel,
            "state": value.state,
            "balance": (value.msatoshi_to_us/100000000).toFixed(4),
            "capacity": (value.msatoshi_total/100000000).toFixed(4),
          });
        }
      });
      callback(channels);
    });
  }

exports.channel = function(channelid, callback) {
  request({
    url: "http://dadserver:8081",
    method: "POST",
    json: true,   // <--Very important!!!
    body: { "method": "channel", "params": [channelid] }
    },
    function (error, response, body){
      callback(body);
  });
}

exports.peers = function(callback) {
  request({
    url: "http://dadserver:8081",
    method: "POST",
    json: true,   // <--Very important!!!
    body: { "method": "peers", "params": [] }
    },
    function (error, response, body){
      callback(body);
  });
}

exports.send = function(invoiceid, callback) {
  request({
    url: "http://dadserver:8081",
    method: "POST",
    json: true,   // <--Very important!!!
    body: { "method": "pay", "params": [invoiceid] }
    },
    function (error, response, body){
      callback(body);
  });
}

exports.connect = function(nodeid, callback) {
  var nodepath = nodeid.split("@");
  request({
    url: "http://dadserver:8082",
    method: "POST",
    json: true,   // <--Very important!!!
    body: { "method": "connect", "params": nodepath }
    },
    function (error, response, body){
      if (error) {
        return console.error(err);
      }
      callback(body);
  });
}

exports.openchannel = function(nodeid, amount, callback) {
  var nodepath = nodeid.split("@");
  request({
    url: "http://dadserver:8082",
    method: "POST",
    json: true,   // <--Very important!!!
    body: { "method": "fundchannel", "params": [nodepath[0], amount] }
    },
    function (error, response, body){
      if (error) {
        return console.error(err);
      }
      callback(body);
  });
}
