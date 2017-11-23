(function() {
  'use strict'

  angular.module('myLightning')
  .service('lightningService', ['$rootScope', '$http', function($rootScope, $http) {
      var ls = this;

      ls._data = null;
      ls._server = "https://seregost.com:8443/";

      var connection = $.connection(ls._server + "signalr");
      connection.received(function (data) {
        console.log("Running refresh");
        if(data.method == "refresh") {
          // invalidate cache
          ls._data = null;
        }
        $rootScope.$broadcast("server:message", data);
      });

      connection.stateChanged(function (change) {
          if (change.newState === $.signalR.connectionState.reconnecting) {
            $rootScope.$broadcast("server:disconnected", null);
          }
      });

      connection.error(function(error) {
          console.warn(error);
      });

      connection.start().done(function() {
          console.log("connection started!");
      });

      ls.waitSync = function() {
        return new Promise((resolve) => {
          if(ls._data == null)
          {
            $http.get(ls._server + 'rest/v1/getalldata').then((response) => {
              ls._data = response.data;
              resolve();
            });
          }
          else
            resolve()
        });
      }

      ls.getServer = function() {
        return ls._server;
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
        return $http.post(ls._server + 'rest/v1/quickpay', {"dest": dest, "memo": memo, "amount": parseFloat(amount)});
      };

      this.execCreateInvoice = function(amount, memo, quickpay) {
        return $http.post(this._server + 'rest/v1/createinvoice', {"memo": memo, "amount": parseFloat(amount), "quickpay": quickpay});
      };

      this.execSendInvoice = function(invoiceid, alias) {
        return $http.post(this._server + 'rest/v1/sendinvoice', {"invoiceid": invoiceid, "alias": alias});
      };

      this.execOpenChannel = function(remotenode, amount) {
        return $http.post(this._server + 'rest/v1/openchannel', {"remotenode": remotenode, "amount": parseFloat(amount)});
      };

      this.execCloseChannel = function(channelpoint) {
        return $http.post(this._server + 'rest/v1/closechannel', {"channelpoint": channelpoint});
      };
  }]);
})();
