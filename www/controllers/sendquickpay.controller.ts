import * as angular from 'angular';
import * as _ from 'underscore';

import BaseModalController from './basemodal.controller'
import LightningService from '../services/lightning.service'
import BroadcastService from '../services/broadcast.service'

export class SendQuickPayController extends BaseModalController {
  static $inject: any = ['$scope', '$element', 'broadcastService', 'quickpaynodes', 'selectednodeid', 'close', 'LightningService', 'ModalService', SendQuickPayController];

  constructor(
    $scope: any,
    $element: any,
    broadcastService: BroadcastService,
    private quickpaynodes: any,
    private selectednodeid: string,
    private close: (x,y) => void,
    private lightningService: LightningService,
    private modalService: any)
  {
    super($scope, $element, broadcastService);
    $scope.server = lightningService.getServer();
    $scope.close = this._close;
    $scope.sendquickpay = this._sendquickpay;

    $scope.quickpaynodes = quickpaynodes;
    $scope.selecteditem = null;
    $scope.preselected = false;

    if(selectednodeid != null) {
      $scope.selecteditem = quickpaynodes[selectednodeid];
      $scope.preselected = true;
    }

    $scope.aliasoptions = {
      minimumChars: 0,
      activateOnFocus: true,
      data: (term) => {
        term = term.toUpperCase();
        return _.filter($scope.quickpaynodes, function (quickpaynode) {
            return (quickpaynode.alias.toUpperCase().startsWith(term) && quickpaynode.server.length > 0);
        });
        //return _.pluck(match, 'alias');
      },
      containerCssClass: 'color-codes',
      selectedTextAttr: 'alias',
      itemTemplateUrl : 'views/alias-list-item.tpl.html',
      itemSelected: function (item) {
        $scope.selecteditem = item.item;
        $scope.quickpay.alias = item.item.alias;
      }
    }
  }

  public _sendquickpay = () => {
    var dest = this.$scope.selecteditem.pub_key;
    var memo = this.$scope.quickpay.memo;
    var amount = this.$scope.quickpay.amount;

    if(amount > 0) {
      $("#quickpaymodal").hide();
      this.modalService.showModal({
        templateUrl: "modals/verification.html",
        controller: "VerificationController",
        inputs: {
          message: "Please enter your PIN to confirm that you wish to pay " + amount.toFixed(2) + " to '" + this.$scope.selecteditem.alias + ".'"
        }
      }).then((modal) => {
        // The modal object has the element built, if this is a bootstrap modal
        // you can call 'modal' to show it, if it's a custom modal just show or hide
        // it as you need to.
        modal.element.modal();
        modal.close.then((result) => {
          $("#quickpaymodal").show();
          if(result.confirmed == true)
          {
            this.$scope.quickpay.loading=true;
            this.lightningService.execQuickPay(result.password, dest, amount, memo).then((response) => {
              if(response.data.error == null) {
                this.$scope.quickpay.haserror = false;
                this.$scope.quickpay.success = true;

                this._closemodal();
                this._close();
              }
              else {
                  this.$scope.quickpay.haserror = true;
                  this.$scope.quickpay.error = response.data.error.message;
              }
              this.$scope.quickpay.loading = false;
            });
          }
        });
      });
    }
  }
  public _close = (): void => {
    this._closemodal();
    this.close(this.$scope.quickpay, 500); // close, but give 500ms for bootstrap to animate
  }
}
angular
  .module("myLightning")
  .controller("SendQuickPayController", SendQuickPayController.$inject);
