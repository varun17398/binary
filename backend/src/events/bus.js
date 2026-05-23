const { EventEmitter } = require('events');

// Thin wrapper around EventEmitter — designed to be swappable for
// Redis Pub/Sub, Kafka, or any other broker without changing call sites.
class InferenceBus extends EventEmitter {
  publish(event, payload) {
    this.emit(event, payload);
  }

  subscribe(event, handler) {
    this.on(event, handler);
  }
}

module.exports = new InferenceBus();
