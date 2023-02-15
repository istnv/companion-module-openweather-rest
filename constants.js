// 1 day forecast (today) includes projected hi/low temps as well as current forecast
export const BASE_URL = 'https://api.openweathermap.org/data/2.5/weather'

export const C_DEGREE = String.fromCharCode(176)

export const C_WINDIR = [
	'N',
	'NNE',
	'NE',
	'ENE',
	'E',
	'ESE',
	'SE',
	'SSE',
	'S',
	'SSW',
	'SW',
	'WSW',
	'W',
	'WNW',
	'NW',
	'NNW',
]

export const VARIABLE_LIST = {
	l_name: { description: 'Location Name', section: '', data: 'name' },
	//l_region: { description: 'Region or State (if available)', section: 'location', data: 'region' },
	l_country: { description: 'Country', section: 'sys', data: 'country' },
	//l_localtime: { description: 'Local Time', section: 'location', data: 'dt' },
	c_time: { description: 'Time last updated', section: 'time', data: 'dt' },
	c_sunrise: { description: 'Sunrise', section: 'time', data: 'sys.sunrise' },
	c_sunset: { description: 'Sunset', section: 'time', data: 'sys.sunset' },
	c_temp: { description: 'Temperature', section: 'main', data: 'temp' },
	c_feels: { description: 'Feels like', section: 'main', data: 'feels_like' },
	c_day: { description: 'Is it daytime?', section: 'internal' },
	c_text: { description: 'Conditions', section: 'weather', data: 'main' },
	c_wind: { description: 'Wind speed', section: 'wind', data: 'speed' },
	c_winddeg: { description: 'Wind degrees', section: 'wind', data: 'deg' },
	c_winddir: { description: 'Wind direction', section: 'internal' },
}
