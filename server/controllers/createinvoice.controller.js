(function() {
  'use strict'
  angular.module('myLightning')
  .controller('CreateInvoiceController', ['$scope', '$element', 'broadcastService', 'lightningService', 'close',
  function($scope, $element, broadcastService, lightningService, close) {
    broadcastService.send("child:showalert",
      "To create a new invoice enter an amount and optional memo. Enabling Quick Pay will allow customers to request automatic invoices from you in the future.");

    $scope.createinvoice = () => {
      var amount = $scope.createinvoice.amount;
      var memo = $scope.createinvoice.memo;

      if(amount > 0) {
        $scope.createinvoice.loading=true;

        var quickpay = false;
        // TODO: get rid of jquery!
        if($("#invoiceeasypay").is(":checked") == true) {
          quickpay=true;
        }

        lightningService.execCreateInvoice(amount, memo, quickpay).then((response) => {
          if(response.data.error == null) {
            $scope.createinvoice.haserror = false;
            $scope.createinvoice.codeready = true;

            $('#invoice-image').show().attr('src', lightningService.getServer() + "rest/v1/getqrimage?inputcode=" + response.data.payment_request);
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
