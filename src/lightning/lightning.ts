import LNDLightning from './lnd';

const spawn = require('child_process').spawn;
const config = require('config');

export interface ILightning {
  PubKey: string;
  ShouldUpdate: boolean;
  NewTransactions: Array<any>;
  NewChannels: Array<any>;

  SendInvoice(invoiceid: string, alias: string): Promise<any>;
  QuickPay(pub_key: string, amount: number, memo: string): Promise<any>;
  CreateInvoice(memo: string, amount: number, quickpay: boolean): Promise<any>;
  GetInvoiceDetails(payment_request: string): Promise<any>;
  
  AddContact(alias: string, nodeid: string, server: string): Promise<any>;

  OpenChannel(nodeid: string, amount: number): Promise<any>;
  CloseChannel(channelid: string, force: boolean): Promise<any>;

  Close(): void;
}

export class LightningFactory {
  private static _nodes: Array<ILightning> = [];
  private static _btcd: any;

  public static Start() {
    // Run btcd
    // TODO: Username/password config.
    // var params =
    // [
    //   '--simnet',
    //   '--txindex',
    //   `--rpcuser=${config.get("rpcuser")}`,
    //   `--rpcpass=${config.get("rpcpass")}`
    // ]
    //
    // if(config.has("miningaddr"))
    //   params.push(`--miningaddr=${config.get("miningaddr")}`);

    // this._btcd = spawn('../bin/btcd.exe', params);
  }

  public static getLightning(userid: string, rpcport: number, peerport: number, ishub: boolean): ILightning {
    // TODO: instance class per config.
    var node: ILightning = new LNDLightning(userid, rpcport, peerport, ishub);

    this._nodes.push(node);
    return node;
  }

  public static Stop()
  {
    // Stop all lightning nodes.
    this._nodes.forEach((node) => {
      node.Close();
    });

    // this._btcd.kill();
  }
}
