'use strict'

import logger = require("../utilities/logger");

import * as fs from 'fs';
import * as bcrypt from "bcrypt";

import {sprintf} from 'sprintf';

export interface User {
  id: string;
  rpcport: number;
  peerport: number;
  password: string;
  ishub: boolean;
}

export class UserManager {
  // Singleton instance of user manager.
  private static _instance: UserManager = new UserManager("users");

  private _usersById: any;
  private _userdb: string;

  constructor(userdb: string) {
    this._usersById = {}
    this._userdb = sprintf("./db/%s.json", userdb);

    if(fs.existsSync(this._userdb))
    {
      // Read user store.
      var data = fs.readFileSync(this._userdb, 'utf8');
      this._usersById = JSON.parse(data);
      logger.info("Loaded users.json.")
    }
  }

  public static getInstance(): UserManager
  {
    return UserManager._instance;
  }

  // TODO: Update to support admin addition of users.
  public AddUser(userid: string, user: User): User {
    this._usersById[userid] = user;
    fs.writeFileSync(this._userdb, JSON.stringify(this._usersById, null, 2))

    return this._usersById[userid];
  }

  public UpdatePassword(userid: string, password: string, callback: (User) => void): void {
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

  public GetUser(userid: string): User {
    return this._usersById[userid];
  }

  public VerifyPassword(userid: string, password: string, callback: (boolean, User) => void): void {
    var user: User = this._usersById[userid];

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

  public each(callback: (string, User) => void) {
    var keys = Object.keys(this._usersById);
    for(var i=0;i<keys.length;i++){
      callback(keys[i], this._usersById[keys[i]])
    }
  }

  public DeleteUser(userid : string): boolean {
    delete this._usersById[userid];
    fs.writeFileSync(this._userdb, JSON.stringify(this._usersById, null, 2))
    logger.info(userid, "User deleted from system.");

    return true;
  }
}
