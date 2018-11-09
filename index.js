const EventEmitter = require('events');
const net = require('net');
const dgram = require('dgram');

class OmniServer extends EventEmitter {
  constructor({ tcpPort, udpPort }) {
    super();
    this._tcpServer = this._createTcpServer(tcpPort);
    this._udpServer = this._createUdpServer(udpPort);
  }

  _createTcpServer(port) {
    const server = net.createServer(connection => {
      connection.on('data', data => {
        this.emit('tcp-data', data.toJSON());
      });
      connection.on('error', () => null);
    });
    server.listen(port, () => this.emit('tcp-up'));
    return server;
  }

  _createUdpServer(port) {
    const server = dgram.createSocket('udp4', data => {
      this.emit('udp-data', data.toJSON());
    });
    server.once('listening', () => this.emit('udp-up'));
    server.bind(port);
    return server;
  }
}

module.exports = function netPlugin({ tcpPort = 7070, udpPort = 7070 }, log) {
  const server = new OmniServer({ tcpPort, udpPort });
  server.once('tcp-up', () =>
    log.info(`TCP server is listening on port ${tcpPort}`)
  );
  server.once('udp-up', () =>
    log.info(`UDP server is listening on port ${udpPort}`)
  );
  return {
    type: 'net',
    input({ protocol }, execute) {
      switch (protocol.toUpperCase()) {
        case 'TCP': {
          return server.on('tcp-data', execute);
        }
        case 'UDP': {
          return server.on('udp-data', execute);
        }
        default: {
          log.error(`Bad input protocol ${protocol}`);
        }
      }
    },
    output({ protocol, host, port }) {
      let clientPromise;
      switch (protocol.toUpperCase()) {
        case 'TCP': {
          clientPromise = new Promise(resolve => {
            const client = net.createConnection({ port, host }, () => {
              resolve(data => client.write(data));
            });
          });
          break;
        }
        case 'UDP': {
          const client = dgram.createSocket('udp4');
          const boundClient = data => client.send(data, port, host);
          clientPromise = Promise.resolve(boundClient);
          break;
        }
        default: {
          log.error(`Bad output protocol ${protocol}`);
          return () => null;
        }
      }
      return async value => {
        switch (typeof value) {
          case 'string': {
            break;
          }
          case 'object': {
            if (value && value.type === 'Buffer') {
              value = Buffer.from(value);
              break;
            }
          }
          default: {
            value = JSON.stringify(value);
          }
        }
        const send = await clientPromise;
        return send(value);
      };
    },
  };
};
