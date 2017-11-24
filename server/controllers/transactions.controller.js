// Main angular logic.
(function() {
  'use strict'
  angular.module('myLightning')
  .controller('TransactionController', ['$scope', 'lightningService', 'ModalService', '$location', function($scope, lightningService, ModalService, $location) {
    var vm = this;

    // Function binding
    vm.refresh = refresh;
    vm.isloaded = false;

    vm.refresh();

    /**
    * SignalR receive message loop.
    * @param {json} data - contains type of update and any paramaters
    */
    $scope.$on('server:message', (tmp, data) => {
      if(data.method == "refresh") {
        setTimeout(() => {vm.refresh()}, 2000);
      }
      else if(data.method == "newtransactions") {
        // Wait a little bit to allow payments to settle.  Then refresh our data.
        setTimeout(() => {vm.refresh()}, 2000);
      }
      else if(data.method == "newchannels") {
        setTimeout(() => {vm.refresh()}, 2000);
      }
    });

    /**
    * Refresh data from the server.  Called when page loads or SignalR events happen.
    */
    function refresh(){
      lightningService.waitSync().then(() => {
        return lightningService.getUsers();
      }).then((user) => {
        vm.user = user;
        return lightningService.getTransactions();
      }).then((transactions) => {
        vm.transactions = transactions.slice(0,15);;
        vm.transactions.forEach((value) => {
          var monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
            "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
          ];

          var time_stamp = new Date(value.time_stamp*1000);
          value.month = monthNames[time_stamp.getMonth()];
          value.day = time_stamp.getDate();

          if(value.type=="transaction") {
            value.icon = "icons/bitcoin.png";
            if(value.amount > 0) {
              value.class = "btn-success";
            }
            if(value.amount < 0) {
              value.class = "btn-danger"
            }
          }
          else if(value.type=="payment") {
            value.icon = "icons/lightning.png";
            value.class = "btn-danger"
          }
          else if(value.type=="invoice") {
            value.icon = "icons/lightning.png";
            value.class = "btn-success";
            if(value.memo != null && value.memo.length > 0)
              value.desc_sub = "Via Lightning for '"+value.memo+"'";
          }
        });
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
