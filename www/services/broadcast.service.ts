import * as angular from 'angular';

export default class BroadcastService {
  static $inject: any = ['$rootScope', BroadcastService];

  constructor(private $rootScope: ng.IRootScopeService) { }

  public send(msg: string, data: string) {
    this.$rootScope.$broadcast(msg, data);
  }
}

angular
  .module("myLightning")
  .service("broadcastService", BroadcastService.$inject);
