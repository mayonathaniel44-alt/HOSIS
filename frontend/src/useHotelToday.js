import { useEffect, useState } from 'react'
function today(timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date())
}
export default function useHotelToday(timeZone = 'Asia/Manila') {
  const [value, setValue] = useState(() => today(timeZone))
  useEffect(() => {
    const tick = () => setValue(today(timeZone))
    const timer = setInterval(tick, 30000)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', tick)
    }
  }, [timeZone])
  return value
}
