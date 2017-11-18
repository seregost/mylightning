// Main angular logic.
var app = window.angular.module('myLightning');
app.controller('Main', ['$scope', '$http', 'lightningService', function($scope, $http, lightningService) {
  var vm = this;
  var connection = $.connection('/signalr');

  // Variables
  vm.user = {}
  vm.channels = [];
  vm.selectedchannel = {"filter": "Open", "text": "Open"};
  vm.selectedalias = {};
  vm.hasaliases = false;
  vm.callbackcontrol = "";

  // Function binding
  vm.setcallbackcontrol = setcallbackcontrol;
  vm.channelfilterselected = channelfilterselected;
  vm.showaliases =  vm.hasaliases;
  vm.aliasselected = aliasselected;
  vm.sendquickpay = sendquickpay;
  vm.close = close;
  vm.refresh = refresh;

  vm.refresh();

  // SignalR binding.
  connection.received(function (data) {
   if(data.method == "refresh")
      console.log("Refreshing account.");
      vm.refresh();
    if(data.method == "newtransactions") {
      $("#transaction-box-text").text("New invoice received for \""+data.params[0].memo+"\" in the amount of "+data.params[0].value.toFixed(4))
      $("#transaction-box").fadeIn().delay(5000).fadeOut("slow");

      // Check if we've recieved payment for an open invoice.
      data.params.forEach((value) => {
        if(value.payment_request == $('#invoice-code').text()) {
          // If the payment has been recieved, force the modal to close.
          $("#close-invoice").click();
        }
      });
    }
  });

  connection.start().done(function() {
      console.log("connection started!");
  });

  /////////////////

  // Control to set callback when scanner closes.
  function setcallbackcontrol(control)
  {
    vm.callbackcontrol = control;
  }

  // Stop Qr scanner
  $('#qrscannermodal').on('hide.bs.modal', () => {
    try {
      $("#v").remove();
      $("#qr-canvas").remove();

      vm.invoicecode = $("#result").text();
      $scope.$apply();

      $('#reader').html5_qrcode_stop();

    } catch (e) {
      alert("Recoverable exception closing QR scanning software. " + e.message)
    }
  });

  function channelfilterselected(item, text) {
      vm.selectedchannel.filter = item;
      vm.selectedchannel.text = text;
  }

  /**
  * View event to update the alias selected as part of the quick pay process.
  * @param {string} pub_key - public key of the selected alias.
  */
  function aliasselected(pub_key) {
      vm.selectedalias = vm.quickpaynodes[pub_key];
      $('#quickpaymodal').modal('show');
  }

  /**
  * Send a quick pay to another party.
  */
  function sendquickpay() {
    var dest = vm.selectedalias.pub_key;
    var memo = vm.quickpay.memo;
    var amount = vm.quickpay.amount;

    if(amount > 0) {
      vm.quickpay.loading=true;

      lightningService.execQuickPay(dest, amount, memo).then((response) => {
        if(response.error == null) {
          quickpayform.reset();
          vm.quickpay.haserror = false;
          $('#quickpaymodal').modal('toggle');
        }
        else {
            vm.quickpay.haserror = true;
            vm.quickpay.error = response.error.message;
            $scope.$apply();
        }
        vm.quickpay.loading = false;
      });
    }
  }

  /**
  * Close a specified channel.
  * @param {string} channelpoint - the channelpoint identifying the channel to close.
  */
  function close(channelpoint) {
    lightning.closechannel(channelpoint, (response) => {
      console.log(response);
      refreshChannels();
      vm.refresh();
    });
  }

  /**
  * Refresh data from the server.  Generally called when SignalR events happen.
  */
  function refresh(){
    lightningService.getQuickPayNodes().then((aliases) => {
      if(Object.keys(aliases.data).length > 0)
        vm.hasaliases = true;
      vm.quickpaynodes = aliases.data;

      lightningService.getChannels().then((response) => {
        vm.channels = response.data;

        // Update remote IDs to meaningful alias when we have.
        vm.channels.forEach((value) => {
          var keys = Object.keys(vm.quickpaynodes);
          for(var i=0;i<keys.length;i++){
            vm.quickpaynodes[keys[i]].pub_key = keys[i];
            if(value.node == keys[i]) {
                value.alias = vm.quickpaynodes[keys[i]].alias
            }
          }
        });
      });
    });

    lightningService.getInfo().then((response) => {
      vm.info = response.data;
    });
    lightningService.getBalances().then((response) => {
      vm.balances = response.data;
      vm.balances.btcfunds /= 100000;
      vm.balances.lntfunds /= 100000;
    });
    lightningService.getUsers().then((response) => {
      vm.user = response.data;
    });
    lightningService.getAddress().then((response) => {
      vm.btcaddress = JSON.parse(response.data);
    });
  }
}]);



$(() => {
  $('#send-payment').bind("click",function(){

    var invoiceid = $('#invoice').val();
    var alias = $('#paymentalias').val();
    if(invoiceid.length > 80)
    {
      console.log("Paying invoice");
      $.post('/rest/v1/sendinvoice', {"invoiceid": invoiceid, "alias": alias}, (response) => {
        if(response.error == null) {
          $('#payment-form').trigger('reset');
          $('#payment-validation-error').hide();
          $('#sendpaymentmodal').modal('toggle');
        }
        else
        {
            $('#payment-validation-error').show();
            $('#payment-validation-text').text(response.error.message);
        }
      });
    }
    else {
      // TODO: pay to bitcoin address
      $('#payment-validation-error').show();
      $('#payment-validation-text').text("Invalid routing number.");
    }
    return false;
  });

  $('#qrscannermodal').on('show.bs.modal', function (e) {
    $("#result").text("");
    $('#reader').html5_qrcode(function(data, stream) {
        $("#result").text(data);
        $('#qrscannermodal').modal('toggle');
      },
      function(error, stream) {
      },
      function(videoError, stream) {
      }
    );
  });

  $('#do-payment').click(function() {
    $('#sendpaymentmodal').modal('show');
  });

  $('#do-payment2').click(function() {
    $('#sendpaymentmodal').modal('show');
  });

  $('#submit-channel').bind("click", function() {
    var remotenode = $('#remotenode').val();
    var amount = $('#amount').val();
    if(remotenode.length > 0 && amount > 0)
    {
      $("#cancel-channel").attr("disabled",true);
      $("#submit-channel").attr("disabled",true);
      $("#channel-loader").show();
      $.post('/rest/v1/openchannel', {"remotenode": remotenode, "amount": parseFloat(amount)}, (response) => {
        if(response.error == null) {
          $('#openchannel-form').trigger('reset');
          $('#channel-validation-error').hide();
          $('#openchannelmodal').modal('toggle');
        }
        else
        {
            $('#channel-validation-error').show();
            $('#channel-validation-text').text(JSON.stringify(response.error.message));
        }
        $("#cancel-channel").attr("disabled",false);
        $("#submit-channel").attr("disabled",false);
        $("#channel-loader").hide();
      });
    }
    return false;
  });

  $('#close-invoice').bind("click", function() {
    $("#createinvoiceform")[0].reset();
    $('#invoice-image').attr('src', "").hide();
    $('#invoice-code').text("").hide();
  });

  // $('#submit-invoice').bind("click", function() {
  //
  // });

  $("#submit-invoice").bind("click", function() {
    var memo = $('#invoicememo').val();
    var amount = $('#invoiceamount').val();
    if(amount > 0) {
      $("#submit-invoice").attr("disabled",true);
      $("#cancel-invoice").attr("disabled",true);
      $("#invoice-loader").show();

      $.post('/rest/v1/createinvoice', {"memo": memo, "amount": parseFloat(amount)}, (response) => {
        if(response.error == null) {
          $('#openchannel-form').trigger('reset');
          $('#invoice-validation-error').hide();

          var easypay = "";

          if($("#invoiceeasypay").is(":checked") == true) {
            console.log("easypay");
            easypay = "easypay&";
          }

          $('#invoice-image').show().attr('src', "https://seregost.com:8443/rest/v1/getinvoiceqr?" + easypay + new Date().getTime());
          $('#invoice-code').text(response.payment_request).show();
        }
        else
        {
            $('#invoice-validation-error').show();
            $('#invoice-validation-text').text(response.error.message);
            $('#invoice-image').attr('src', "").hide();
        }
        $("#cancel-invoice").attr("disabled",false);
        $("#submit-invoice").attr("disabled",false);
        $("#invoice-loader").hide();
      });
    }
    // do something with the form field
  });

  $("#pop").on("click", function() {
     $('#imagepreview').attr('src', $('#imageresource').attr('src')); // here asign the image to the modal when the user click the enlarge link
     $('#imagemodal').modal('show'); // imagemodal is the id attribute assigned to the bootstrap modal, then i use the show function
  });
})
