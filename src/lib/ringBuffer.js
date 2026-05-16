/**
 * Lock-free ring buffer for WebSocket backpressure.
 * Events arrive faster than React can render; this decouples production from consumption.
 */
export class RingBuffer {
  constructor(capacity = 5000) {
    this.buf      = new Array(capacity)
    this.capacity = capacity
    this.head     = 0
    this.tail     = 0
    this.size     = 0
    this.dropped  = 0
  }

  push(item) {
    if (this.size === this.capacity) {
      // Overwrite oldest — count as dropped
      this.dropped++
      this.head = (this.head + 1) % this.capacity
      this.size--
    }
    this.buf[this.tail] = item
    this.tail = (this.tail + 1) % this.capacity
    this.size++
  }

  drain(n) {
    const count = Math.min(n, this.size)
    const out   = new Array(count)
    for (let i = 0; i < count; i++) {
      out[i]    = this.buf[this.head]
      this.head = (this.head + 1) % this.capacity
    }
    this.size -= count
    return out
  }

  get fillRatio() { return this.size / this.capacity }
  get totalDropped() { return this.dropped }
  get currentSize() { return this.size }
}
