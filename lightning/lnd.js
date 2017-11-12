// npm install request
var request = require('request');
var bitcoin = require('bitcoin');
var _ = require('lodash');

exports.getbalance = function(callback) {

}

exports.getfunds = function(callback) {

}

exports.getinfo = function(callback) {
  var https = require('https');
  var fs = require('fs');

  var options = {
      ca: fs.readFileSync('./config/tls.cert'),
      hostname: 'dadserver',
      port: 8081,
      path: '/v1/getinfo',
      method: 'GET'
  };
  options.agent = new https.Agent(options);

  var req = https.request(options, (res) => {
    console.log('statusCode:', res.statusCode);
    console.log('headers:', res.headers);
    res.on('data', (d) => {
      process.stdout.write(d);
    });
  });

  req.on('error', (e) => {
    console.error(e);
  });
  req.end();
}

  // var grpc = require('grpc');
  // var fs = require("fs");
  //
  // //  Lnd cert is at ~/.lnd/tls.cert on Linux and
  // //  ~/Library/Application Support/Lnd/tls.cert on Mac
  // var lndCert = fs.readFileSync("./config/tls.cert");
  // var credentials = grpc.credentials.createSsl(lndCert);
  // var lnrpcDescriptor = grpc.load("./config/rpc.proto");
  // var lnrpc = lnrpcDescriptor.lnrpc;
  // var lightning = new lnrpc.Lightning('dadserver:10009', credentials);
  //
  // lightning.GetInfo({}, function(err, response) {
  // 	console.log('GetInfo:', err);
  // });
//}

exports.channels = function(callback) {

}

exports.peers = function(callback) {

}

exports.send = function(invoiceid, callback) {

}

exports.openchannel = function(nodeid, amount, callback) {

}
