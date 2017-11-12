// npm install request
var request = require('request');
var bitcoin = require('bitcoin');
var _ = require('lodash');

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
  var fs = require('fs');
  var channels = JSON.parse(fs.readFileSync('json/channels.json', 'utf8'));
  var funds = 0;
  $.each(channels, function (key, value) {
    funds += value.balance
  });
  callback(funds);
}

exports.getinfo = function(callback) {
  request({
    url: "http://dadserver:8081",
    method: "POST",
    json: true,   // <--Very important!!!
    body: { "method": "getinfo", "params": [] }
    },
    function (error, response, body){
      callback(body);
  });
}

exports.channels = function(callback) {
  var channels = []
  request({
    url: "http://dadserver:8081",
    method: "POST",
    json: true,   // <--Very important!!!
    body: { "method": "channels", "params": [] }
    },
    function (error, response, body){
      var channels = []
      var finished = _.after(body.result.length, function(){
        callback(channels);
      });

      $.each(body.result, function (key, value) {
        request({
          url: "http://dadserver:8081",
          method: "POST",
          json: true,   // <--Very important!!!
          body: { "method": "channel", "params": [value] }
          },
          function (error, response, body){
            var balance = 0;
            var capacity = 0;
            if(body.result.data.commitments != null)
            {
              balance = body.result.data.commitments.localCommit.spec.toLocalMsat/100000000;
              capacity = body.result.data.commitments.commitInput.txOut.amount.amount/100000
            }

            channels.push(
            {
              "node": body.result.nodeid,
              "channel": body.result.channelId,
              "state": body.result.state,
              "balance": balance,
              "capacity": capacity
            });
            finished();
        });
      });
  });
}

exports.peers = function(callback) {
  request({
    url: "http://dadserver:8081",
    method: "POST",
    json: true,   // <--Very important!!!
    body: { "method": "allnodes", "params": [] }
    },
    function (error, response, body){
      console.log(body);
      callback(body);
  });
}

exports.send = function(invoiceid, callback) {
  request({
    url: "http://dadserver:8081",
    method: "POST",
    json: true,   // <--Very important!!!
    body: { "method": "send", "params": [invoiceid] }
    },
    function (error, response, body){
      callback(body);
  });
}

exports.openchannel = function(nodeid, amount, callback) {
  var nodepath = nodeid.split("@");
  var server = nodepath[1].split(":");
  request({
    url: "http://dadserver:8081",
    method: "POST",
    json: true,   // <--Very important!!!
    body: { "method": "open", "params": [""+nodepath[0], ""+server[0], parseInt(server[1]), (amount*100000), 0] }
    },
    function (error, response, body){
      callback(body);
  });
}
