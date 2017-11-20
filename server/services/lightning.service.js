(function() {
  'use strict'

  angular.module('myLightning', ['angularModalService'])
  .service('lightningService', ['$http', function($http) {
      this.getInfo = function() {
          return $http.get('/rest/v1/info');
      };

      this.getBalances = function(query) {
          return $http.get('/rest/v1/balances');
      };

      this.getUsers = function() {
          return $http.get('/rest/v1/user');
      };

      this.getAddress = function() {
          return $http.get('/rest/v1/address');
      };

      this.getChannels = function() {
          return $http.get('/rest/v1/channels');
      };

      this.getQuickPayNodes = function() {
          return $http.get('/rest/v1/quickpaynodes');
      };

      this.execQuickPay = function(dest, amount, memo) {
        return $http.post('/rest/v1/quickpay', {"dest": dest, "memo": memo, "amount": parseFloat(amount)});
      };

      this.execCreateInvoice = function(amount, memo) {
        return $http.post('/rest/v1/createinvoice', {"memo": memo, "amount": parseFloat(amount)});
      };

      this.execSendInvoice = function(invoiceid, alias) {
        return $http.post('/rest/v1/sendinvoice', {"invoiceid": invoiceid, "alias": alias});
      };

      this.execOpenChannel = function(remotenode, amount) {
        return $http.post('/rest/v1/openchannel', {"remotenode": remotenode, "amount": parseFloat(amount)});
      };

      this.execCloseChannel = function(channelpoint) {
        return $http.post('/rest/v1/closechannel', {"channelpoint": channelpoint});
      };
  }]);
})();
