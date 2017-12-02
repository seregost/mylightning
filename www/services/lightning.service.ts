import * as angular from 'angular';
import WebSocketClient from '../js/websocketclient'

export default class LightningService {
  static $inject: any = ['$rootScope', '$http', LightningService];

  private _id: number = null;
  private _data: any = null;
  private _server: string = "://localhost:8444/";

  constructor(private $rootScope: ng.IRootScopeService, private $http : ng.IHttpService) {
    var local = this;

    var storage = window.localStorage;
    if(storage.getItem("server") != null)
    this._server = "://"+storage.getItem("server")+"/";
    else
    this._server = location.origin.replace("https", "")+"/";

    var wsc = new WebSocketClient();
    wsc.open("wss" + this._server);

    wsc.onopen = (e) => {
      $rootScope.$broadcast("server:connected", null);
      console.log('Connected to server');
      if(this._id != null) {
        clearInterval(this._id);
      }
      this.waitSync().then(() => {
        wsc.send(this._data.user.id);
      });
    }

    wsc.onmessage = (evt, number) => {
      var data = JSON.parse(evt.data);
      if(data.method == "refresh") {
        // invalidate cache
        console.log("Running periodic refresh.")
        this._data = null;
      }
      if(data.method == "newtransactions") {
        // invalidate cache
        console.log("Updating data due to new transactions.")
        this._data = null;
      }
      $rootScope.$broadcast("server:message", data);
    }

    wsc.onclose = (evt) => {
      $rootScope.$broadcast("server:disconnected", evt);
    }
  }

  public waitSync(): Promise<any> {
    return new Promise((resolve) => {
      if(this._data == null)
      {
        this.$http.get("https" + this._server + 'rest/v1/getalldata').then((response) => {
          this._data = response.data;
          resolve();
        });
      }
      else
      resolve()
    });
  }

  public getServer(): string {
    return "https" + this._server;
  }
  public getInfo(): Promise<any> {
    return new Promise((resolve) => resolve(this._data.info));
  }

  public getBalances(query): Promise<any> {
    return new Promise((resolve) => resolve(this._data.balances));
  }

  public getUsers(): Promise<any> {
    return new Promise((resolve) => resolve(this._data.user));
  }

  public getAddress(): Promise<any> {
    return new Promise((resolve) => resolve(this._data.address));
  }

  public getChannels(): Promise<any> {
    return new Promise((resolve) => resolve(this._data.channels));
  }

  public getQuickPayNodes(): Promise<any> {
    return new Promise((resolve) => resolve(this._data.quickpaynodes));
  }

  public getTransactions(): Promise<any> {
    return new Promise((resolve) => resolve(this._data.transactions));
  }

  public execQuickPay(password, dest, amount, memo): ng.IPromise<ng.IHttpResponse<{}>> {
    return this.$http.post("https" + this._server + 'rest/v1/quickpay',
    {
      "_csrf" : this._data._csrf,
      "password": password,
      "dest": dest,
      "memo": memo,
      "amount": parseFloat(amount)
    });
  }

  public execCreateInvoice(amount, memo, quickpay): ng.IPromise<ng.IHttpResponse<{}>> {
    return this.$http.post("https" + this._server + 'rest/v1/createinvoice',
    {
      "_csrf" : this._data._csrf,
      "memo": memo,
      "amount": parseFloat(amount),
      "quickpay": quickpay
    });
  }

  public execSendInvoice(password, invoiceid, alias): ng.IPromise<ng.IHttpResponse<{}>> {
    return this.$http.post("https" + this._server + 'rest/v1/sendinvoice',
    {
      "_csrf" : this._data._csrf,
      "password": password,
      "invoiceid": invoiceid,
      "alias": alias
    });
  }

  public execOpenChannel(remotenode, amount): ng.IPromise<ng.IHttpResponse<{}>> {
    return this.$http.post("https" + this._server + 'rest/v1/openchannel',
    {
      "_csrf" : this._data._csrf,
      "remotenode": remotenode,
      "amount": parseFloat(amount)
    });
  };

  public execCloseChannel(password, channelpoint): ng.IPromise<ng.IHttpResponse<{}>> {
    return this.$http.post("https" + this._server + 'rest/v1/closechannel',
    {
      "_csrf" : this._data._csrf,
      "password": password,
      "channelpoint": channelpoint
    });
  };

  public execLogout(): ng.IPromise<ng.IHttpResponse<{}>> {
    return this.$http.post("https" + this._server + 'rest/v1/logout', {"_csrf" : this._data._csrf});
  };
}

angular
  .module("myLightning")
  .service("LightningService", LightningService.$inject);
