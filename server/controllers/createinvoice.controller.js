(function() {
  'use strict'
  angular.module('myLightning')
  .controller('CreateInvoiceController', ['$scope', '$element', 'lightningService', 'close', function($scope, $element, lightningService, close) {
    $scope.createinvoice = () => {
      var amount = $scope.createinvoice.amount;
      var memo = $scope.createinvoice.memo;

      if(amount > 0) {
        $scope.createinvoice.loading=true;

        lightningService.execCreateInvoice(amount, memo).then((response) => {
          if(response.data.error == null) {
            $scope.createinvoice.haserror = false;
            $scope.createinvoice.codeready = true;
            var easypay = "";

            if($("#invoiceeasypay").is(":checked") == true) {
              console.log("easypay");
              easypay = "easypay&";
            }

            $('#invoice-image').show().attr('src', "rest/v1/getinvoiceqr?" + easypay + new Date().getTime());
            $scope.createinvoice.invoicecode = response.data.payment_request;
          }
          else {
              $scope.createinvoice.haserror = true;
              $scope.createinvoice.codeready = false;
              $scope.createinvoice.error = response.data.error.message;
          }
          $scope.createinvoice.loading = false;
        });
      }
    }
    $scope.close = () => {
      closemodal();
      close($scope.createinvoice, 500); // close, but give 500ms for bootstrap to animate
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
