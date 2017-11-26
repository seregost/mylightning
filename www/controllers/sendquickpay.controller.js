(function() {
  'use strict'
  angular.module('myLightning')
  .controller('SendQuickPayController', ['$scope', '$element', 'quickpaynodes', 'lightningService', 'close', function($scope, $element, quickpaynodes, lightningService, close) {
    $scope.quickpaynodes = quickpaynodes;

    $scope.selecteditem = null;

    $scope.aliasoptions = {
      minimumChars: 0,
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

    $scope.sendquickpay = () => {
      var dest = $scope.selecteditem.item.pub_key;
      var memo = $scope.quickpay.memo;
      var amount = $scope.quickpay.amount;

      if(amount > 0) {
        $scope.quickpay.loading=true;

        lightningService.execQuickPay(dest, amount, memo).then((response) => {
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
