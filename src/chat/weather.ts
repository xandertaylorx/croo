/** WMO weather codes (as used by Open-Meteo) as a short label and an emoji. */
const CODES: [number[], string, string, string][] = [
  [[0], 'Clear sky', '☀️', '🌙'],
  [[1], 'Mostly clear', '🌤️', '🌙'],
  [[2], 'Partly cloudy', '⛅', '☁️'],
  [[3], 'Overcast', '☁️', '☁️'],
  [[45, 48], 'Fog', '🌫️', '🌫️'],
  [[51, 53, 55], 'Drizzle', '🌦️', '🌧️'],
  [[56, 57], 'Freezing drizzle', '🌧️', '🌧️'],
  [[61, 63], 'Rain', '🌧️', '🌧️'],
  [[65], 'Heavy rain', '🌧️', '🌧️'],
  [[66, 67], 'Freezing rain', '🌧️', '🌧️'],
  [[71, 73, 75, 77], 'Snow', '🌨️', '🌨️'],
  [[80, 81], 'Showers', '🌦️', '🌧️'],
  [[82], 'Heavy showers', '⛈️', '⛈️'],
  [[85, 86], 'Snow showers', '🌨️', '🌨️'],
  [[95], 'Thunderstorm', '⛈️', '⛈️'],
  [[96, 99], 'Thunderstorm with hail', '⛈️', '⛈️'],
]

export function describeWeather(code: number, day = true): { label: string; emoji: string } {
  const hit = CODES.find(([codes]) => codes.includes(code))
  return hit ? { label: hit[1], emoji: day ? hit[2] : hit[3] } : { label: 'Unknown', emoji: '🌡️' }
}
