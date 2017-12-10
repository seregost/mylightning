import * as angular from 'angular';

import BaseModalController from './basemodal.controller'
import LightningService from '../services/lightning.service'

(function() {
  'use strict'
  angular.module('myLightning')
  .controller('OpenChannelController', ['$scope', '$element', 'selectedContact', 'ModalService', 'LightningService', 'close',
  function($scope, $element, selectedContact, ModalService, lightningService, close) {
    // TODO: Fancy up validation check and add password control.
    $scope.contact = selectedContact;

    $scope.openchannel = () => {
      var node = `${$scope.contact.id}@${$scope.contact.channelserver}`;
      var alias  = $scope.contact.alias;
      var amount = $scope.openchannel.amount;

      var nodepath = node.split('@');
      if(nodepath.length > 1) {
        $scope.openchannel.loading=true;

        lightningService.execOpenChannel(node, amount).then((response) => {
          if(response.data.error == null) {
            $scope.openchannel.haserror = false;

            closemodal();
            close($scope.openchannel, 500);
          }
          else {
              $scope.openchannel.haserror = true;
              $scope.openchannel.error = response.data.error.message;
          }
          $scope.openchannel.loading = false;
        });
      }
    }
    $scope.close = () => {
      closemodal();
      close($scope.openchannel, 500); // close, but give 500ms for bootstrap to animate
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
