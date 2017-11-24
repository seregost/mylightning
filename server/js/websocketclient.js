function WebSocketClient(){
  this.number = 0;	// Message number
  this.autoReconnectInterval = 5*1000;	// ms
}

WebSocketClient.prototype.open = function(url){
  client = this;
  client.url = url;
  client.instance = new WebSocket(this.url);
  client.instance.onopen = function() {
    client.onopen();
  };
  client.instance.onmessage = function(data) {
    client.number ++;
    client.onmessage(data,this.number);
  };
  client.instance.onclose = function(e) {
    switch (e){
      case 1000:	// CLOSE_NORMAL
      console.log("WebSocket: closed");
      break;
      default:	// Abnormal closure
      client.reconnect(e);
      break;
    }
    client.onclose(e);
  };
  client.instance.onerror = function(e) {
    switch (e.code){
      case 'ECONNREFUSED':
      client.reconnect(e);
      break;
      default:
      client.onerror(e);
      break;
    }
  };
}
WebSocketClient.prototype.send = function(data,option){
  try{
    client.instance.send(data,option);
  }catch (e){
    client.instance.emit('error',e);
  }
}
WebSocketClient.prototype.reconnect = function(e){
  console.log(`WebSocketClient: retry in ${this.autoReconnectInterval}ms`,e);

  var that = this;
  setTimeout(function(){
    console.log("WebSocketClient: reconnecting...");
    that.open(that.url);
  },this.autoReconnectInterval);
}
WebSocketClient.prototype.onopen = function(e){	console.log("WebSocketClient: open",arguments);	}
WebSocketClient.prototype.onmessage = function(data,flags,number){	console.log("WebSocketClient: message",arguments);	}
WebSocketClient.prototype.onerror = function(e){	console.log("WebSocketClient: error",arguments);	}
WebSocketClient.prototype.onclose = function(e){	console.log("WebSocketClient: closed",arguments);	}
