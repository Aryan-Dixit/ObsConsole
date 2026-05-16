// review/EventTable.tsx — INTENTIONALLY FLAWED for code review exercise
'use client'
import { useState, useEffect } from 'react'

interface TelemetryEvent {
  id: string; level: string; message: string;
  timestamp: string; host: string; latency: number
}

interface Props { serviceId: string; wsUrl: string }

export default function EventTable({ serviceId, wsUrl }: Props) {
  const [events, setEvents] = useState<TelemetryEvent[]>([])

  useEffect(() => {
    const ws = new WebSocket(wsUrl)

    // BUG 1 (CRITICAL): setState called on every WS message at 50–500 msg/sec.
    // Each call schedules a React re-render. At 500 msg/s, this creates a render
    // queue that can never drain, freezing the main thread (INP >> 500ms).
    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        setEvents(prev => [...prev, event])  // BUG 1: direct setState in onmessage
        // BUG 2: unbounded array — at 200 msg/s for 5 min = 60,000 events, ~12MB heap
      } catch {}
    }

    // BUG 5: ws never closed if wsUrl prop changes — old WS stays open,
    // keeps pushing to stale setEvents, React warns about setState after unmount
    return () => { ws.close() }
  }, [wsUrl])  // wsUrl change: cleanup runs but previous ws.onmessage still fires during close

  return (
    <table aria-label="Event stream">
      {/* BUG 6: no aria-live region — screen readers get no announcement of new rows */}
      <thead>
        <tr>
          <th>Time</th><th>Level</th><th>Host</th><th>Message</th><th>Latency</th>
        </tr>
      </thead>
      <tbody>
        {/* BUG 3: renders ALL events to DOM — at 1000 events: 1000 <tr> elements,
            layout/paint thrash on every update. No virtualization. */}
        {events.map((ev, i) => (
          // BUG 4: index as key — when events are prepended or head-evicted,
          // all keys shift, React re-renders every row on every event.
          <tr key={i}>
            <td>{ev.timestamp?.slice(11,19)}</td>
            <td>{ev.level}</td>
            <td>{ev.host}</td>
            <td>{ev.message}</td>
            <td>{ev.latency}ms</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
