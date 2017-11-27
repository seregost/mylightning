(function() {
  'use strict'
  angular.module('myLightning')
  .controller('SendQuickPayController', ['$scope', '$element', 'broadcastService', 'quickpaynodes', 'lightningService', 'ModalService', 'close', function($scope, $element, broadcastService, quickpaynodes, lightningService, ModalService, close) {
    $scope.quickpaynodes = quickpaynodes;

    $scope.selecteditem = null;

    $scope.aliasoptions = {
      minimumChars: 0,
      activateOnFocus: true,
      data: function (term) {
        term = term.toUpperCase();
        return _.filter($scope.quickpaynodes, function (quickpaynode) {
            return quickpaynode.alias.toUpperCase().startsWith(term);
        });
        //return _.pluck(match, 'alias');
      },
      containerCssClass: 'color-codes',
      selectedTextAttr: 'alias',
      itemTemplateUrl : 'views/alias-list-item.tpl.html',
      itemSelected: function (item) {
        $scope.selecteditem = item;
        $scope.quickpay.alias = item.item.alias;
      }
    }
    $scope.showinfo = () => {
      broadcastService.send("child:showalert",
        "Enter an alias and amount to quickly send a payment to a friend's account.  Aliases are part of your address booked, and can be created any time you pay an invoice to a friend.");
    }
    $scope.sendquickpay = () => {
      var dest = $scope.selecteditem.item.pub_key;
      var memo = $scope.quickpay.memo;
      var amount = $scope.quickpay.amount;

      if(amount > 0) {
        $("#quickpaymodal").hide();
        ModalService.showModal({
          templateUrl: "modals/verification.html",
          controller: "VerificationController",
          inputs: {
            message: "Please enter your PIN to confirm that you wish to pay " + amount.toFixed(2) + " to '" + $scope.selecteditem.item.alias + ".'"
          }
        }).then(function(modal) {
          // The modal object has the element built, if this is a bootstrap modal
          // you can call 'modal' to show it, if it's a custom modal just show or hide
          // it as you need to.
          modal.element.modal();
          modal.close.then(function(result) {
            $("#quickpaymodal").show();
            if(result.confirmed == true)
            {
              $scope.quickpay.loading=true;
              lightningService.execQuickPay(result.password, dest, amount, memo).then((response) => {
                if(response.data.error == null) {
                  $scope.quickpay.haserror = false;
                  $scope.quickpay.success = true;

                  closemodal();
                  close($scope.quickpay, 500);
                }
                else {
                    $scope.quickpay.haserror = true;
                    $scope.quickpay.error = response.data.error.message;
                }
                $scope.quickpay.loading = false;
              });
            }
          });
        });
      }
    }

    $scope.close = () => {
      closemodal();
      close($scope.quickpay, 500); // close, but give 500ms for bootstrap to animate
    };
    function closemodal()
    {
      $element.modal('hide');

      // Hack to eliminate backdrop remaining bug.
      var backdrop = $(".modal-backdrop");
      if(backdrop != null) backdrop.remove();
    }
  }]);
})();
