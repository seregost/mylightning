import * as angular from 'angular';

import { BaseModalController } from './basemodal.controller'
import { LightningService } from '../services/lightning.service'

namespace Controllers {
  export interface IQRInfo {
    caption: string;
    inputcode: string;
  }

  export class QRDisplayController extends BaseModalController {
    static $inject: any = ['$scope', '$element', 'qrinfo', 'close', 'LightningService', QRDisplayController];

    constructor(
      private $scope: any,
      $element: any,
      private qrinfo: IQRInfo,
      private close: (x,y) => void,
      private lightningService: LightningService)
    {
      super($element);
      $scope.server = lightningService.getServer();
      $scope.qrinfo = qrinfo;
      $scope.close = this._close;
    }

    public _close = () => {
      this._closemodal();
      this.close(this.$scope.result, 500); // close, but give 500ms for bootstrap to animate
    }
  }
  angular
    .module("myLightning")
    .controller("QRDisplayController", QRDisplayController.$inject);
}
