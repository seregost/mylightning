import * as angular from 'angular';
import * as Clipboard from 'clipboard';

import BaseModalController from './basemodal.controller'
import BroadcastService from '../services/broadcast.service'
import LightningService from '../services/lightning.service'

export class SendPaymentController extends BaseModalController {
  static $inject: any = ['$scope', '$element', 'broadcastService', 'close' , 'LightningService', 'ModalService', SendPaymentController];

  constructor(
    $scope: any,
    $element: any,
    broadcastService: BroadcastService,
    private close: (x,y) => void,
    private lightningService: LightningService,
    private modalService: any)
  {
    super($scope, $element, broadcastService);
    $scope.server = lightningService.getServer();
    $scope.sendpayment = {};
    $scope.close = this._close;
    $scope.sendpayment = this._sendpayment;
    $scope.doqrscanner = this._doqrscanner;

    new Clipboard(".btn");
  }

  /**
   * Send payment to party with optional memo.
   * @param  string invoicecode.length>80 invoice code
   * @return string                       memo
   */
  private _sendpayment = () => {
    var invoicecode = this.$scope.sendpayment.invoicecode;
    var alias = this.$scope.sendpayment.alias;

    // TODO: decode invoice to make sure it is what we expect.
    if(invoicecode.length > 80) {
      $("#sendpaymentmodal").hide();
      this.modalService.showModal({
        templateUrl: "modals/verification.html",
        controller: "VerificationController",
        inputs: {
          message: "Please enter your PIN to confirm that you wish to pay this invoice."
        }
      }).then((modal) => {
        // The modal object has the element built, if this is a bootstrap modal
        // you can call 'modal' to show it, if it's a custom modal just show or hide
        // it as you need to.
        modal.element.modal();
        modal.close.then((result) => {
          $("#sendpaymentmodal").show();
          if(result.confirmed == true)
          {
            this.$scope.sendpayment.loading=true;

            this.lightningService.execSendInvoice(result.password, invoicecode, alias).then((response) => {
              if(response.data.error == null) {
                this.$scope.sendpayment.haserror = false;
                this.$scope.sendpayment.success = true;

                this._closemodal();
                this._close();
              }
              else {
                  this.$scope.sendpayment.haserror = true;
                  this.$scope.sendpayment.error = response.data.error.message;
              }
              this.$scope.sendpayment.loading = false;
            });
          };
        });
      });
    }
    else {
      // TODO: pay to bitcoin address
      this.$scope.sendpayment.haserror = true;
      this.$scope.sendpayment.error = "Invalid routing number.";
    }
  }

  private _doqrscanner = () => {
    if(window.cordova != null) {
      var cordova: any = window.cordova
      cordova.plugins.barcodeScanner.scan(
        function (result) {
          if(!result.cancelled) {
            if(result.format == "QR_CODE") {
              this.$scope.sendpayment.invoicecode = result.text;
              this.$scope.$apply();
            }
          }
        },
        function (error) {
          alert("Scanning failed: " + error);
        }
      );
    }
    else {
      // angular.element('#quickpaymodal').modal('show');
      this.modalService.showModal({
        templateUrl: "modals/qrscanner.html",
        controller: "QRScannerController",
      }).then(function(modal) {
        // The modal object has the element built, if this is a bootstrap modal
        // you can call 'modal' to show it, if it's a custom modal just show or hide
        // it as you need to.
        modal.element.modal();
        modal.close.then(function(result) {
          this.$scope.sendpayment.invoicecode = result;
        });
      });
    }
  }
  
  private _close = (): void => {
    this._closemodal();
    this.close(this.$scope.sendpayment, 500); // close, but give 500ms for bootstrap to animate
  }
}
angular
  .module("myLightning")
  .controller("SendPaymentController", SendPaymentController.$inject);
