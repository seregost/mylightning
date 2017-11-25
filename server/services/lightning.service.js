(function() {
  'use strict'

  angular.module('myLightning')
  .service('lightningService', ['$rootScope', '$http', function($rootScope, $http) {
      var ls = this;
      var id = null;

      ls._data = null;
      ls._server = "://localhost:8444/";

      var storage = window.localStorage;
      if(storage.getItem("server") != null)
        ls._server = "://"+storage.getItem("server")+"/";
      else
        ls._server = location.origin.replace("https", "")+"/";

      var wsc = new WebSocketClient();
      wsc.open("wss" + ls._server);

      wsc.onopen = function(e){
        $rootScope.$broadcast("server:connected", null);
        console.log('Connected to server');
        if(id != null) {
          clearInterval(id);
        }
        ls.waitSync().then(() => {
          wsc.send(ls._data.user.id);
        });
      }

      wsc.onmessage = function(evt,number){
        var data = JSON.parse(evt.data);
        if(data.method == "refresh") {
          // invalidate cache
          console.log("Running periodic refresh.")
          ls._data = null;
        }
        if(data.method == "newtransactions") {
          // invalidate cache
          console.log("Updating data due to new transactions.")
          ls._data = null;
        }
        $rootScope.$broadcast("server:message", data);
      }

      wsc.onclose = function(evt) {
        $rootScope.$broadcast("server:disconnected", evt);
      }

      ls.waitSync = function() {
        return new Promise((resolve) => {
          if(ls._data == null)
          {
            $http.get("https" + ls._server + 'rest/v1/getalldata').then((response) => {
              ls._data = response.data;
              resolve();
            });
          }
          else
            resolve()
        });
      }

      ls.getServer = function() {
        return "https" + ls._server;
      }
      ls.getInfo = function() {
          return new Promise((resolve) => resolve(ls._data.info));
      };

      ls.getBalances = function(query) {
          return new Promise((resolve) => resolve(ls._data.balances));
      };

      ls.getUsers = function() {
          return new Promise((resolve) => resolve(ls._data.user));
      };

      ls.getAddress = function() {
          return new Promise((resolve) => resolve(ls._data.address));
      };

      ls.getChannels = function() {
          return new Promise((resolve) => resolve(ls._data.channels));
      };

      ls.getQuickPayNodes = function() {
          return new Promise((resolve) => resolve(ls._data.quickpaynodes));
      };

      ls.getTransactions = function() {
          return new Promise((resolve) => resolve(ls._data.transactions));
      };

      ls.execQuickPay = function(dest, amount, memo) {
        return $http.post("https" + ls._server + 'rest/v1/quickpay', {"dest": dest, "memo": memo, "amount": parseFloat(amount)});
      };

      this.execCreateInvoice = function(amount, memo, quickpay) {
        return $http.post("https" + this._server + 'rest/v1/createinvoice', {"memo": memo, "amount": parseFloat(amount), "quickpay": quickpay});
      };

      this.execSendInvoice = function(invoiceid, alias) {
        return $http.post("https" + this._server + 'rest/v1/sendinvoice', {"invoiceid": invoiceid, "alias": alias});
      };

      this.execOpenChannel = function(remotenode, amount) {
        return $http.post("https" + this._server + 'rest/v1/openchannel', {"remotenode": remotenode, "amount": parseFloat(amount)});
      };

      this.execCloseChannel = function(channelpoint) {
        return $http.post("https" + this._server + 'rest/v1/closechannel', {"channelpoint": channelpoint});
      };

      this.execLogout = function() {
        return $http.post("https" + this._server + 'rest/v1/logout');
      };
  }]);
})();
