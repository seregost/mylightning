// Main angular logic.
(function() {
  'use strict'
  angular.module('myLightning')
  .controller('HomeController', ['$scope', 'lightningService', 'ModalService', '$location', function($scope, lightningService, ModalService, $location) {
    var vm = this;

    // Variables
    vm.selectedchannel = {"filter": "", "text": "All"};
    vm.selectedalias = {};
    vm.hasaliases = false;
    vm.isloaded = false;

    // Function binding
    vm.refresh = refresh;
    vm.doquickpay = doquickpay;
    vm.docreateinvoice = docreateinvoice;
    vm.dosendpayment = dosendpayment;
    vm.doopenchannel = doopenchannel;
    vm.doqrdisplay = doqrdisplay;
    vm.close = close;

    vm.channelfilterselected = channelfilterselected;
    vm.showaliases =  vm.hasaliases;

    vm.refresh();

    /**
    * SignalR receive message loop.
    * @param {json} data - contains type of update and any paramaters
    */
    $scope.$on('server:message', (tmp, data) => {
      if(data.method == "refresh") {
        setTimeout(() => {vm.refresh()}, 3000);
      }
      else if(data.method == "newtransactions") {
        // Wait a little bit to allow payments to settle.  Then refresh our data.
        setTimeout(() => {vm.refresh()}, 3000);
      }
      else if(data.method == "newchannels") {
        setTimeout(() => {vm.refresh()}, 3000);
      }
    });

    /**
    * Set filter parameters for the channel list.
    */
    function channelfilterselected(item, text) {
        vm.selectedchannel.filter = item;
        vm.selectedchannel.text = text;
    }

    /**
    * View event to run the quick pay process.
    * @param {string} pub_key - public key of the selected alias.
    */
    function doquickpay(pub_key) {
      vm.selectedalias = vm.quickpaynodes[pub_key];
      ModalService.showModal({
        templateUrl: "modals/sendquickpay.html",
        controller: "SendQuickPayController",
        inputs: {
          quickpaynodes: vm.quickpaynodes
        }
      }).then(function(modal) {
          modal.element.modal();
          $scope.$emit("child:showalert",
            "Enter an alias and amount to quickly send a payment to a friend's account");
          modal.close.then(function(result) {
            vm.quickpay = result;
            if(vm.quickpay.success == true)
            {
              $scope.$emit("child:showalert",
                "You sent a payment to '"+vm.quickpay.alias+"' in the amount of: "+vm.quickpay.amount.toFixed(2));
              vm.refresh();
            }
        });
      });
    }

    /**
    * Generate an invoice with QR code and id.
    */
    function docreateinvoice() {
      ModalService.showModal({
        templateUrl: "modals/createinvoice.html",
        controller: "CreateInvoiceController",
      }).then(function(modal) {
          modal.element.modal();
          modal.close.then(function(result) {
        });
      });
    }

    /**
    * Send a payment with the scanned QR code.
    */
    function dosendpayment() {
      ModalService.showModal({
        templateUrl: "modals/sendpayment.html",
        controller: "SendPaymentController",
      }).then(function(modal) {
          modal.element.modal();
          $scope.$emit("child:showalert",
            "To submit your payment, please enter or scan the routing number provided by your vendor.");
          modal.close.then(function(result) {
            vm.sendpayment = result;
            if(vm.sendpayment.success == true)
            {
              $scope.$emit("child:showalert",
                "You have successfully paid the invoice.");
              vm.refresh();
            }
        });
      });
    }

    /**
    * Open a new channel with another peer.
    */
    function doopenchannel() {
      ModalService.showModal({
        templateUrl: "modals/openchannel.html",
        controller: "OpenChannelController",
      }).then(function(modal) {
          modal.element.modal();
          $scope.$emit("child:showalert",
            "To open a new channel, enter or scan the remote node id and amount to fund.");
          modal.close.then(function(result) {
        });
      });
    }

    function doqrdisplay(caption, qrcode)
    {
      ModalService.showModal({
        templateUrl: "modals/qrdisplay.html",
        controller: "QRDisplayController",
        inputs: {
          qrinfo : {"caption": caption, "inputcode": qrcode}
        }
      }).then(function(modal) {
          modal.element.modal();
          modal.close.then(function(result) {
        });
      });
    }
    /**
    * Close a specified channel.
    * @param {string} channelpoint - the channelpoint identifying the channel to close.
    */
    function close(channelpoint) {
      lightningService.execCloseChannel(channelpoint).then((response) => {
        console.log(response);
      });
    }

    /**
    * Refresh data from the server.  Called when page loads or SignalR events happen.
    */
    function refresh(){
      lightningService.waitSync().then(() => {
        return lightningService.getQuickPayNodes();
      }).then((aliases) => {
        if(Object.keys(aliases).length > 0)
          vm.hasaliases = true;
        vm.quickpaynodes = aliases;

        // Set public keys.
        var keys = Object.keys(vm.quickpaynodes);
        for(var i=0;i<keys.length;i++){
          vm.quickpaynodes[keys[i]].pub_key = keys[i];
        }
        return lightningService.getChannels();
      }).then((response) => {
        vm.channels = response;

        // Update remote IDs to meaningful alias when we have.
        vm.channels.forEach((value) => {
          var keys = Object.keys(vm.quickpaynodes);
          for(var i=0;i<keys.length;i++){
            if(value.node == keys[i]) {
                value.alias = vm.quickpaynodes[keys[i]].alias
            }
          }
        });
        return lightningService.getInfo();
      }).then((response) => {
        vm.info = response;

        return lightningService.getBalances();
      }).then((response) => {
        vm.balances = {"btcfunds": response.btcfunds, "lntfunds": response.lntfunds};
        return lightningService.getUsers()
      }).then((response) => {
        vm.user = response;
        return lightningService.getAddress();
      }).then((response) => {
        vm.btcaddress = response;
        vm.isloaded = true;
        $scope.$apply();
      });
    }

    $("#pop").on("click", function() {
       $('#imagepreview').attr('src', $('#imageresource').attr('src')); // here asign the image to the modal when the user click the enlarge link
       $('#imagemodal').modal('show'); // imagemodal is the id attribute assigned to the bootstrap modal, then i use the show function
    });

  }]);
})();
