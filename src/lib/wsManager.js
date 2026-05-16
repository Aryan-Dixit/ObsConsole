'use client'
/**
 * WebSocketManager — wraps a WS connection with:
 *  - RingBuffer backpressure
 *  - rAF batch flush (≤200 events/frame)
 *  - Exponential-backoff reconnect
 *  - State machine: IDLE → CONNECTING → OPEN → RECONNECTING
 */
import { RingBuffer } from './ringBuffer'

const WS_BASE = process.env.NEXT_PUBLIC_WS_BASE || 'ws://localhost:4000'
const MAX_EVENTS = 50000
const BATCH_SIZE = 200

export class WebSocketManager {
  constructor({ serviceId, onBatch, onStateChange, onDrop }) {
    this.serviceId     = serviceId
    this.onBatch       = onBatch
    this.onStateChange = onStateChange
    this.onDrop        = onDrop
    this.ring          = new RingBuffer(5000)
    this.ws            = null
    this.rafId         = null
    this.retryDelay    = 1000
    this.state         = 'IDLE'
    this.rateCount     = 0
    this.rateHistory   = []
    this.lastRateTs    = performance.now()
    this.totalReceived = 0
    this._destroyed    = false
  }

  connect() {
    if (this._destroyed) return
    this._setState('CONNECTING')
    const url = `${WS_BASE}/stream/services/${this.serviceId}/events`
    try {
      this.ws = new WebSocket(url)
    } catch {
      this._scheduleReconnect(); return
    }

    this.ws.onopen = () => {
      this.retryDelay = 1000
      this._setState('OPEN')
      this._startFlush()
    }

    this.ws.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data)
        if (ev.type === 'connected') return
        this.ring.push(ev)
        this.rateCount++
        this.totalReceived++
      } catch {}
    }

    this.ws.onerror = () => {}
    this.ws.onclose = () => {
      cancelAnimationFrame(this.rafId)
      if (!this._destroyed) this._scheduleReconnect()
    }
  }

  _startFlush() {
    const flush = () => {
      if (this._destroyed) return
      const now = performance.now()
      const elapsed = now - this.lastRateTs
      if (elapsed >= 500) {
        const rate = Math.round((this.rateCount / elapsed) * 1000)
        this.rateHistory = [...this.rateHistory.slice(-29), rate]
        this.rateCount = 0
        this.lastRateTs = now
      }

      const batch = this.ring.drain(BATCH_SIZE)
      if (batch.length > 0) {
        this.onBatch({ batch, dropped: this.ring.totalDropped, rate: this.currentRate, fill: this.ring.fillRatio })
      }
      if (this.ring.fillRatio > 0.7) this.onDrop?.(this.ring.totalDropped)
      this.rafId = requestAnimationFrame(flush)
    }
    this.rafId = requestAnimationFrame(flush)
  }

  _scheduleReconnect() {
    if (this._destroyed) return
    this._setState('RECONNECTING')
    const jitter = Math.random() * 1000
    setTimeout(() => { if (!this._destroyed) this.connect() }, this.retryDelay + jitter)
    this.retryDelay = Math.min(this.retryDelay * 2, 30000)
  }

  _setState(s) {
    this.state = s
    this.onStateChange?.(s)
  }

  get currentRate() { return this.rateHistory[this.rateHistory.length - 1] || 0 }

  destroy() {
    this._destroyed = true
    cancelAnimationFrame(this.rafId)
    this.ws?.close()
  }
}
