// src/hooks/useIsMobile.js
// ADDED — shared responsive breakpoint hook. The app has no CSS media-query
// layer (styling is inline React style objects throughout), so components
// use this hook to conditionally switch layout at the given breakpoint
// instead of duplicating resize-listener boilerplate in every page.
//
// Usage:
//   const isMobile = useIsMobile()          // default breakpoint: 768px
//   const isNarrow = useIsMobile(480)        // custom breakpoint (phones)

import { useState, useEffect } from 'react'

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= breakpoint : false
  )

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= breakpoint)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [breakpoint])

  return isMobile
}
