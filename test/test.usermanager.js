'use strict'

const config = require('config');
const expect = require('chai').expect
const UserManager = require('../utilities/usermanager.js');

describe('usermanger', function() {
  it('should properly construct', () => {
    var userManager = new UserManager("testusers.js")
    expect(userManager).to.be.a('object')
  });
  it('should allow adding users', () => {
    var userManager = new UserManager("testusers.js")
    expect(userManager.adduser("123", {displayName: "Test User"}).displayName).to.eql("Test User")
  });
  it('should allow getting user', () => {
    var userManager = new UserManager("testusers.js")
    expect(userManager.getuser("123").displayName).to.eql("Test User")
  });
  it('should allow deleting users', () => {
    var userManager = new UserManager("testusers.js")
    expect(userManager.deleteuser("123")).to.eql(true)
  });
});
