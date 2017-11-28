'use strict'

const fs = require('fs');
const logger = require("../logger");
const sprintf = require('sprintf').sprintf;
const bcrypt = require("bcrypt");

class UserManager {
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

  // TODO: Update to support admin addition of users.
  adduser(userid, sourceUser) {
    var user = this._usersById[userid];

    if(user == null)
    {
        var user =
        {
          id: userid,
          userName: userid,
          displayName: sourceUser.displayName,
          givenName: sourceUser.name.givenName,
          photo: sourceUser.photos[0].value
        };
        logger.info(userid, "User record added.");
    }
    else {
        // Update any data points that might ahve changed.
        user.userName = userid,
        user.displayName = sourceUser.displayName;
        user.givenName = sourceUser.name.givenName;
        user.photo = sourceUser.photos[0].value;
        logger.info(userid, "User record updated.");
    }
    this._usersById[userid] = user;
    fs.writeFileSync(this._userdb, JSON.stringify(this._usersById, null, 2))

    return this._usersById[userid];
  }

  updatepassword(userid, password, callback) {
    bcrypt.hash(password, 10, (err, bcryptedPassword) => {
      if(err != null)
        callback(null);

      var user = this._usersById[userid];
      if(user != null) {
          user.password = bcryptedPassword;
          this._usersById[userid] = user;
          fs.writeFileSync(this._userdb, JSON.stringify(this._usersById, null, 2))

          return callback(this._usersById[userid]);
      }
      else {
          callback(null)
      }
    });
  }

  getuser(userid) {
    return this._usersById[userid];
  }

  verifypassword(userid, password, callback) {
    var user = this._usersById[userid];

    if(password == null || password == undefined)
      callback(false, null);
    else {
      bcrypt.compare(password, user.password, function(err, doesMatch){
        if(err != null)
          callback(false, null);
        else {
          if (doesMatch) {
             callback(true, user);
          }
          else{
             callback(false, null);
          }
        }
      });
    }
  }

  each(callback) {
    var keys = Object.keys(this._usersById);
    for(var i=0;i<keys.length;i++){
      callback(keys[i], this._usersById[keys[i]])
    }
  }

  deleteuser (userid) {
    delete this._usersById[userid];
    fs.writeFileSync(this._userdb, JSON.stringify(this._usersById, null, 2))
    logger.info(userid, "User deleted from system.");

    return true;
  }
}

module.exports.userManager = new UserManager("users");
