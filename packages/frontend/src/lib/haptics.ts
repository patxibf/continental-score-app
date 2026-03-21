export function haptic(style: 'light' | 'medium' | 'heavy' = 'light') {
  if (!navigator.vibrate) return
  const durations = { light: 10, medium: 25, heavy: 50 }
  navigator.vibrate(durations[style])
}
