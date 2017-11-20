'use strict'

const config = require('config');
const server = require('../server');
const expect = require('chai').expect
const Lightning = require('../lightning/lnd.js');

describe('lnd', function() {
  var lightning0 = new Lightning("test123", 10001, 10011);
  var lightning1 = new Lightning("test124", 10002, 10012);
  var pub_key = null;
  var invoiceid = null;

  it('should properly construct', () => {
    expect(lightning0).to.be.an('object');
  });
  // it('should successfully get a witness address', (done) => {
  //   lightning.getaddress((result) => {
  //     expect(result).to.be.a('string');
  //     done();
  //   });
  // });
  it('should successfully get a wallet balance', (done) => {
    lightning0.getbalance((result) => {
      expect(result).to.be.a('number');
      done();
    });
  });
  it('should successfully get channel funds', (done) => {
    lightning0.getfunds((result) => {
      expect(result).to.be.a('number');
      done();
    });
  });
  it('should successfully get node info', (done) => {
    lightning0.getinfo((result) => {
      pub_key = result.result.nodeId;
      expect(result.result.nodeId).to.be.a('string');
      expect(result.result.alias).to.be.a('string');
      expect(result.result.port).to.be.a('number');
      expect(result.result.synchronized).to.be.a('boolean');
      expect(result.result.blockheight).to.be.a('number');
      done();
    });
  });
  it('should successfully get channels', (done) => {
    lightning0.channels((result) => {
      expect(result.error).to.be.a('undefined');
      done();
    });
  });
  it('should successfully create an invoice', (done) => {
    lightning0.createinvoice("Test Invoice.", 0.001, true, (result) => {
      expect(result.error).to.be.a('undefined');
      invoiceid = result.payment_request;
      done();
    });
  });
  it('should error on invalid invoice', (done) => {
    lightning0.createinvoice("Test Invoice.", 5000, true, (result) => {
      expect(result.error).to.be.an('object');
      done();
    });
  });
  it('should successfully send a payment', (done) => {
    lightning1.sendinvoice(invoiceid, "The Bank", (result) => {
      expect(result.error).to.be.a('undefined');
      done();
    });
  });
  it('should error on an invalid invoice', (done) => {
    lightning1.sendinvoice("@", "The Bank", (result) => {
      expect(result.error).to.be.an('object');
      done();
    });
  });
  it('should successfully send a quickpay', (done) => {
    lightning1.quickpay(pub_key, 0.001, "The Bank", (result) => {
      expect(result.error).to.be.a('undefined');
      done();
    });
  });
  it('should error on invalid quickpay', (done) => {
    lightning1.quickpay(pub_key, 5000, "The Bank", (result) => {
      expect(result.error).to.be.an('object');
      done();
    });
  });
  it('should require a refresh', () => {
    expect(lightning0.shouldupdate()).to.eql(true);
  });
  it('should have new transactions', () => {
    expect(lightning0.newtransactions().length > 0).to.eql(true);
  });
  it('should list transactions', (done) => {
    lightning0.gettransactions((result) => {
      expect(result.error).to.be.a('undefined');
      done();
    });
  });
  // TODO: figure out how to deal with channel open & close testing.
});
