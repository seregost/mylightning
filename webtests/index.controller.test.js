// Mocked Data Service
angular.module('mock.services', [])
.service('lightningService', function($q) {
    var userService = {};

    userService.getInfo = function() {
      return new Promise((callback) => callback(
        {
          "data": {
            "result": {
              "nodeId": "0274ebebee1cda0834e01cb2edc4f9a26f42623899dbe5b49439013a45df0e9685",
              "alias": "dadserver",
              "port": 10012,
              "synchronized": false,
              "blockheight": 410
            }
          }
        }
      ));
    };

    userService.getBalances = function(query) {
      return new Promise((callback) => callback({"data":{"btcfunds":4988500,"lntfunds":4988500}}));
    };

    userService.getUsers = function() {
      return new Promise((callback) => callback(""));
    };

    userService.getAddress = function() {
      return new Promise((callback) => callback({"data":"rdbcYXL2EH4Ta8fyrxxqePvJZujdNRDjz1"}));
    };

    userService.getChannels = function() {
      return new Promise((callback) => callback(
        {
          "data": [
            {
              "node": "039a013d24c9ae30475fb79abfc3fb41e85d20441336c6cfc45bff491d1517db9b",
              "channel": "442003674431488",
              "state": "Open",
              "balance": 50.0000,
              "capacity": 100,
              "channelpoint": "8c9ecd0c7ae16af7704035ee8ea79991f46c3adce2ad73be1d85abdfffab79c2:0"
            }
          ]
        }
      ));
    };

    userService.getQuickPayNodes = function() {
      return new Promise((callback) => callback(
        {
          "data":
          {
            "039a013d24c9ae30475fb79abfc3fb41e85d20441336c6cfc45bff491d1517db9b": {
              "alias": "The Bank",
              "server": "localhost:8443"
            }
          }
        }));
    };

    userService.execQuickPay = function(dest, amount, memo) {
      return new Promise((callback) => callback(""));
    };

    userService.execSendInvoice = function(invoiceid, alias) {
      return new Promise((callback) => callback(""));
    };

    return userService;
});

var ngElementFake = function(el) {
  return {
    modal: function(s) { return; }
  }
}


describe('index.controller', function () {
  var scope, ctrl, httpBackend,spy;

  beforeEach(angular.mock.module('myLightning'));

  beforeEach(angular.mock.module('mock.services'));

  beforeEach(inject(function(_$controller_, _$rootScope_, _$httpBackend_, _lightningService_, _ModalService_) {
    httpBackend = _$httpBackend_
    httpBackend.when('GET', 'http://localhost:9876/signalr/negotiate')
      .respond({userId: 'userX'}, {'A-Token': 'xxx'});

    // Disable signalr
    spyOn($.connection('/signalr'), 'start').and.returnValue(null);
    spy = spyOn(angular, 'element').and.callFake(ngElementFake);

    if(ctrl == null)
    {
      ctrl = _$controller_('MainController', {
        $scope: scope,
        lightningService: _lightningService_,
        Modalservice: _ModalService_
      });
    }
  }));

  afterEach(function() {
    httpBackend.verifyNoOutstandingExpectation();
    httpBackend.verifyNoOutstandingRequest();
    spy.and.callThrough();
  });

  it('should refresh', function () {
    ctrl.refresh();
    expect(ctrl).toBeDefined();
  });

  it('should support channelfilterselected', function() {
    ctrl.channelfilterselected("Open", "Open");
    expect(ctrl.selectedchannel.filter).toBe("Open");
    expect(ctrl.selectedchannel.text).toBe("Open");
  });

  it('should support doquickpay', function() {
    ctrl.doquickpay("039a013d24c9ae30475fb79abfc3fb41e85d20441336c6cfc45bff491d1517db9b");
    expect(ctrl.selectedalias.alias).toBe("The Bank");
  });
});
