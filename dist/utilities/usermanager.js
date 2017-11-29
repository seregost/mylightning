'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
var logger = require("../logger");
var bcrypt = require("bcrypt");
var sprintf_1 = require("sprintf");
var UserManager = /** @class */ (function () {
    function UserManager(userdb) {
        this._usersById = {};
        this._userdb = sprintf_1.sprintf("./db/%s.json", userdb);
        if (fs.existsSync(this._userdb)) {
            // Read user store.
            var data = fs.readFileSync(this._userdb, 'utf8');
            this._usersById = JSON.parse(data);
            logger.info("Loaded users.json.");
        }
    }
    UserManager.getInstance = function () {
        return UserManager._instance;
    };
    // TODO: Update to support admin addition of users.
    UserManager.prototype.AddUser = function (userid, user) {
        this._usersById[userid] = user;
        fs.writeFileSync(this._userdb, JSON.stringify(this._usersById, null, 2));
        return this._usersById[userid];
    };
    UserManager.prototype.UpdatePassword = function (userid, password, callback) {
        var _this = this;
        bcrypt.hash(password, 10, function (err, bcryptedPassword) {
            if (err != null)
                callback(null);
            var user = _this._usersById[userid];
            if (user != null) {
                user.password = bcryptedPassword;
                _this._usersById[userid] = user;
                fs.writeFileSync(_this._userdb, JSON.stringify(_this._usersById, null, 2));
                return callback(_this._usersById[userid]);
            }
            else {
                callback(null);
            }
        });
    };
    UserManager.prototype.GetUser = function (userid) {
        return this._usersById[userid];
    };
    UserManager.prototype.VerifyPassword = function (userid, password, callback) {
        var user = this._usersById[userid];
        if (password == null || password == undefined)
            callback(false, null);
        else {
            bcrypt.compare(password, user.password, function (err, doesMatch) {
                if (err != null)
                    callback(false, null);
                else {
                    if (doesMatch) {
                        callback(true, user);
                    }
                    else {
                        callback(false, null);
                    }
                }
            });
        }
    };
    UserManager.prototype.each = function (callback) {
        var keys = Object.keys(this._usersById);
        for (var i = 0; i < keys.length; i++) {
            callback(keys[i], this._usersById[keys[i]]);
        }
    };
    UserManager.prototype.DeleteUser = function (userid) {
        delete this._usersById[userid];
        fs.writeFileSync(this._userdb, JSON.stringify(this._usersById, null, 2));
        logger.info(userid, "User deleted from system.");
        return true;
    };
    // Singleton instance of user manager.
    UserManager._instance = new UserManager("users");
    return UserManager;
}());
exports.UserManager = UserManager;
