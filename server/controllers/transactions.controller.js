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
        vm.refresh();
      }
      else if(data.method == "newtransactions") {
        // Wait a little bit to allow payments to settle.  Then refresh our data.
        setInterval(() => {vm.refresh()}, 2000);
      }
      else if(data.method == "newchannels") {
        setInterval(() => {vm.refresh()}, 2000);
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
        vm.transactions = transactions;
        vm.transactions.forEach((value) => {
          var monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
            "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
          ];

          var time_stamp = new Date(value.time_stamp*1000);
          value.month = monthNames[time_stamp.getMonth()];
          value.day = time_stamp.getDate();

          if(value.amount > 0) {
            value.desc = "Received Bitcoin"
            value.desc_sub = "From Bitcoin address"
          }
          if(value.amount < 0) {
            value.desc = "Sent Bitcoin"
            value.desc_sub = "To Bitcoin address"
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
