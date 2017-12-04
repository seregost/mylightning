import * as angular from 'angular';
import * as Clipboard from 'clipboard';

import BaseModalController from './basemodal.controller'
import BroadcastService from '../services/broadcast.service'
import LightningService from '../services/lightning.service'

export class CreateInvoiceController extends BaseModalController {
  static $inject: any = ['$scope', '$element', 'broadcastService', 'close', 'LightningService', CreateInvoiceController];

  constructor(
    $scope: any,
    $element: any,
    broadcastService: BroadcastService,
    private close: (x,y) => void,
    private lightningService: LightningService)
  {
    super($scope, $element, broadcastService);
    $scope.server = lightningService.getServer();
    $scope.close = this._close;
    $scope.createinvoice = this._createinvoice;

    new Clipboard(".btn");
  }

  private _createinvoice = () => {
    var amount = this.$scope.createinvoice.amount;
    var memo = this.$scope.createinvoice.memo;

    if(amount > 0) {
      this.$scope.createinvoice.loading=true;

      var quickpay = false;
      // TODO: get rid of jquery!
      if($("#invoiceeasypay").is(":checked") == true) {
        quickpay=true;
      }

      this.lightningService.execCreateInvoice(amount, memo, quickpay).then((response: any) => {
        if(response.data.error == null) {
          this.$scope.createinvoice.haserror = false;
          this.$scope.createinvoice.codeready = true;

          // TODO: get rid of jquery!
          $('#invoice-image').show().attr('src', this.lightningService.getServer() + "rest/v1/getqrimage?inputcode=" + response.data.payment_request);

          this.$scope.createinvoice.invoicecode = response.data.payment_request;
        }
        else {
            this.$scope.createinvoice.haserror = true;
            this.$scope.createinvoice.codeready = false;
            this.$scope.createinvoice.error = response.data.error.message;
        }
      this.$scope.createinvoice.loading = false;
      });
    }
  }

  private _close = (): void => {
    this._closemodal();
    this.close(this.$scope.createinvoice, 500); // close, but give 500ms for bootstrap to animate
  }
}
angular
  .module("myLightning")
  .controller("CreateInvoiceController", CreateInvoiceController.$inject);
