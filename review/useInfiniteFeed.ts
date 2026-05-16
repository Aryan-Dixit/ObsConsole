// review/useInfiniteFeed.ts — INTENTIONALLY FLAWED for code review exercise
import { useState, useEffect, useRef, useCallback } from 'react'

interface FeedItem { id: string; content: string }
interface FeedPage  { items: FeedItem[]; nextCursor: string | null }

export function useInfiniteFeed(url: string) {
  const [items, setItems]     = useState<FeedItem[]>([])
  const [cursor, setCursor]   = useState<string | null>(null)
  const [isLoading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // BUG 1: fetchNextPage is not guarded — if sentinel fires twice before the fetch resolves,
  // two in-flight requests will both use the same cursor, causing duplicate items.
  const fetchNextPage = useCallback(async () => {
    setLoading(true)
    const res   = await fetch(`${url}?cursor=${cursor}`)  // BUG 4: no AbortController
    const page: FeedPage = await res.json()
    setItems(prev => [...prev, ...page.items])
    setCursor(page.nextCursor)
    setLoading(false)
  }, [cursor, url])  // stale closure: cursor updates but fetchNextPage may fire with old value

  useEffect(() => {
    // BUG 2: observer is not captured in a local variable — cleanup runs against null ref
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) fetchNextPage()  // BUG 1 consequence: no isLoading guard
    }, { rootMargin: '200px' })

    if (sentinelRef.current) observer.observe(sentinelRef.current)

    return () => {
      // BUG 2: sentinelRef.current may be null here (component unmounted)
      if (sentinelRef.current) observer.unobserve(sentinelRef.current)
    }
  }, [fetchNextPage])

  return { items, isLoading, sentinelRef }
  // BUG 5: No aria-live region — screen readers get no feedback when new items load
  // BUG 5: No keyboard "Load more" fallback — keyboard users can't trigger pagination
}
