'use strict'

const fs = require('fs');
const logger = require("../logger");
const sprintf = require('sprintf').sprintf;

module.exports = class UserManager {
  constructor(userdb) {
    this._usersById = {};
    this._userdb = sprintf("./db/%s.json", userdb);

    if(fs.existsSync(this._userdb))
    {
      // Read user store.
      var data = fs.readFileSync(this._userdb, 'utf8');
      this._usersById = JSON.parse(data);
      logger.info("Loaded users.json.")
    }
  }

  adduser(userid, sourceUser) {
    var user;
    if(this._usersById[userid] == null) {
      user = this._usersById[userid] = {id: userid, displayName: sourceUser.displayName};
      fs.writeFileSync(this._userdb, JSON.stringify(this._usersById))
      logger.info(userid, "New user added to system.");
    }
    return this._usersById[userid];
  }

  getuser(userid) {
    return this._usersById[userid];
  }

  deleteuser (userid) {
    delete this._usersById[userid];
    fs.writeFileSync(this._userdb, JSON.stringify(this._usersById))
    logger.info(userid, "User deleted from system.");

    return true;
  }
}
