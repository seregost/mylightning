export default class WebSocketClient
{
  private number: number
  private autoReconnectInterval: number;
  private url: string;
  private instance: WebSocket;

  constructor() {
    this.number = 0;	// Message number
    this.autoReconnectInterval = 5*1000;	// ms
  }

  public open = (url: string) => {
    var client = this;
    client.url = url;
    client.instance = new WebSocket(this.url);
    client.instance.onopen = function() {
      client.onopen(null);
    };
    client.instance.onmessage = function(data) {
      client.number ++;
      client.onmessage(data,"", client.number);
    };
    client.instance.onclose = function(e: CloseEvent) {
      switch (e.code){
        case 1000:	// CLOSE_NORMAL
          console.log("WebSocket: closed");
          break;
        default:	// Abnormal closure
          client.reconnect(e);
          break;
      }
      client.onclose(e);
    };
    client.instance.onerror = function(e: CloseEvent) {
      var event = '';
      switch (event){
        case 'ECONNREFUSED':
          client.reconnect(e);
          break;
        default:
          client.onerror(e);
          break;
      }
    };
  }
  public send = (data) => {
    try{
      this.instance.send(data);
    }catch (e){
    }
  }

  public reconnect = (e) => {
    console.log(`WebSocketClient: retry in ${this.autoReconnectInterval}ms`, e);

    var that = this;
    setTimeout(function(){
      console.log("WebSocketClient: reconnecting...");
      that.open(that.url);
    },this.autoReconnectInterval);
  }

  public onopen = function(e){	console.log("WebSocketClient: open",arguments);	}
  public onmessage = function(data,flags,number){	console.log("WebSocketClient: message",arguments);	}
  public onerror = function(e){	console.log("WebSocketClient: error",arguments);	}
  public onclose = function(e){	console.log("WebSocketClient: closed",arguments);	}
}
