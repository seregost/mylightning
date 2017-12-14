// Main angular logic.
(function() {
  'use strict'
  angular.module('myLightning')
  .controller('HomeController', ['$scope', 'LightningService', 'ModalService', '$location', '$animate',
  function($scope, lightningService, ModalService, $location, $animate) {
    var vm = this;

    // Variables
    vm.selectedchannel = {"filter": "", "text": "All"};
    vm.selectedalias = {};
    vm.hasaliases = false;
    vm.isloaded = false;

    // Function binding
    vm.refresh = refresh;
    vm.doquickpay = doquickpay;
    vm.doaddcontact = doaddcontact;
    vm.doopenchannel = doopenchannel;
    vm.doreconnect = doreconnect;
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
          quickpaynodes: vm.quickpaynodes,
          selectednodeid: pub_key
        }
      }).then(function(modal) {
          modal.element.modal();
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
    * Open a new channel with another peer.
    */
    function doaddcontact() {
      ModalService.showModal({
        templateUrl: "modals/newcontact.html",
        controller: "NewContactController",
      }).then(function(modal) {
          modal.element.modal();
          // $scope.$emit("child:showalert",
          //   "To add a new contact, enter or scan the contact's lightning address and an alias.");
          modal.close.then(function(result) {
        });
      });
    }

    /**
    * Open a new channel with another peer.
    */
    function doopenchannel(contact) {
      ModalService.showModal({
        templateUrl: "modals/openchannel.html",
        controller: "OpenChannelController",
        inputs: {
          selectedContact: contact
        }
      }).then(function(modal) {
          modal.element.modal();
          // $scope.$emit("child:showalert",
          //   "To add a new contact, enter or scan the contact's lightning address and an alias.");
          modal.close.then(function(result) {
        });
      });
    }

    /**
    * Attempt to reconnect to peer
    */
    function doreconnect(contact) {
      var nodeid = contact.id + "@" + contact.channelserver;
      lightningService.execReconnect(nodeid);
    }

    /**
    * Close a specified channel.
    * @param {string} channelpoint - the channelpoint identifying the channel to close.
    */
    function close(channelpoint, force) {
      ModalService.showModal({
        templateUrl: "modals/verification.html",
        controller: "VerificationController",
        inputs: {
          message: "Enter your PIN to confirm that you wish to close this channel.  Please note that channel settlement " +
          "can sometimes take an hour or more to complete."
        }
      }).then(function(modal) {
        // The modal object has the element built, if this is a bootstrap modal
        // you can call 'modal' to show it, if it's a custom modal just show or hide
        // it as you need to.
        modal.element.modal();
        modal.close.then(function(result) {
          // Hack to eliminate backdrop remaining bug.
          var backdrop = $(".modal-backdrop");
          if(backdrop != null) backdrop.remove();

          if(result.confirmed == true)
          {
            lightningService.execCloseChannel(result.password, channelpoint, force).then((response) => {
              if(response.data.error != null) {
                $scope.$emit("child:showalert",
                  "Failed to close channel: " + response.data.error.message);
              }
              else {
                $scope.$emit("child:showalert",
                  "Initiated settlement of the channel.");
              }
            });
          }
        });
      });

    }

    /**
    * Refresh data from the server.  Called when page loads or SignalR events happen.
    */
    function refresh(){
      $animate.enabled(false);
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
        return lightningService.getAddressBook();
      }).then((response) => {
        vm.fulladdressbook = response;
        vm.addressbook = [];
        var keys = Object.keys(vm.fulladdressbook);
        for(var i=0;i<keys.length;i++){
          var contact = vm.fulladdressbook[keys[i]]
          // Set display type for status.
          if(contact.status.includes("Open"))
            contact.displaytype = "success";
          else if(contact.status.includes("Pending"))
            contact.displaytype = "warning";
          else if(contact.status.includes("Disconnected"))
            contact.displaytype = "info";
          else
            contact.displaytype = "danger"

          contact.channels.forEach((channel) => {
            if(channel.state.includes("Open"))
              channel.displaytype = "success";
            else if(channel.state.includes("Pending"))
              channel.displaytype = "warning";
            else
              channel.displaytype = "danger"
            if(channel.active == false)
                channel.displaytype = "info";
          });
          vm.addressbook.push(contact);
        }
        return lightningService.getInfo();
      }).then((response) => {
        vm.info = response;

        return lightningService.getBalances();
      }).then((response) => {
        vm.balances = {"btcfunds": response.btcfunds, "lntfunds": response.lntfunds};
        return lightningService.getUsers()
      }).then((response) => {
        vm.user = response;

        $scope.$apply();

        setTimeout(() => {$animate.enabled(true)}, 3000);
      });
    }

    $("#pop").on("click", function() {
       $('#imagepreview').attr('src', $('#imageresource').attr('src')); // here asign the image to the modal when the user click the enlarge link
       $('#imagemodal').modal('show'); // imagemodal is the id attribute assigned to the bootstrap modal, then i use the show function
    });

  }]);
})();
