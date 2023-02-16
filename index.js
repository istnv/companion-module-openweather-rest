/* eslint-disable no-useless-escape */

// OpenWeather.com interface

import { combineRgb, Regex } from '@companion-module/base'
import { runEntrypoint, InstanceBase, InstanceStatus } from '@companion-module/base'
import Jimp from 'jimp'
import { UpgradeScripts } from './upgrades.js'
import rest_pkg from 'node-rest-client'
const rest_client = rest_pkg.Client

import { BASE_URL, C_DEGREE, C_WINDIR, VARIABLE_LIST } from './constants.js'

/**
 * Companion instance class openweather-rest
 * Control module for Open Weather API
 *
 * @extends InstanceBase
 * @version 2.0.0
 * @since 2.0.0
 * @author John A Knight, Jr <istnv@istnv.com>
 */
class OWInstance extends InstanceBase {
	/**
	 * Create an instance of the openweather-api module
	 *
	 * @param {Object} internal - holds the instance ID and flags
	 * @since 2.0.0
	 */
	constructor(internal) {
		super(internal)
	}

	/**
	 * Main initialization function called once the module
	 * is OK to start doing things.
	 *
	 * @since 2.0.0
	 */
	async init(config) {
		this.config = config
		this.init_vars()

		// other init methods
		this.init_feedbacks(this)
		this.init_presets()
		this.init_actions()
		this.init_connection()
	}

	/**
	 * Process an updated configuration array.
	 * called from companion when user changes the configuration
	 *
	 * @param {Object} config - the new configuration
	 * @since 2.0.0
	 */
	async configUpdated(config) {
		// save passed config
		this.config = config

		// tear everything down
		this.destroy()

		// ... and start again
		this.init_actions()
		this.init_feedbacks(this)
		this.init_presets()
		this.init_connection()
	}

	/**
	 * Clean up the instance before it is destroyed
	 * or configuration is re-processed
	 *
	 * @since 2.0.0
	 */
	destroy() {
		if (this.heartbeat) {
			clearInterval(this.heartbeat)
			delete this.heartbeat
		}
		this.init_vars()
		if (this.client) {
			delete this.client
		}
	}

	/**
	 * Creates the configuration fields for web config.
	 * called from companion when the config page is shown
	 *
	 * @returns {Array} the config fields
	 * @since 2.0.0
	 */
	getConfigFields() {
		this.REGEX_HEX = '/^[0-9A-Fa-f]+$/'

		const configs = [
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'Information',
				value:
					'This module retrieves weather information from OpenWeather.com.<br>It requires an active internet connection.',
			},
			{
				type: 'textinput',
				id: 'apikey',
				label: 'API Key',
				width: 12,
				tooltip: 'Enter your API Key from OpenWeather.com.',
				regex: this.REGEX_HEX
			},
			{
				type: 'textinput',
				id: 'location',
				label: 'Location',
				tooltip: 'Weather Location to Display',
				width: 12,
			},
			{
				type: 'dropdown',
				id: 'units',
				label: 'Measurement Units',
				width: 6,
				default: 'i',
				choices: [
					{ id: 'i', label: 'Fahrenheit and MPH' },
					{ id: 'm', label: 'Celsius and kPH' },
				],
			},
			{
				type: 'textinput',
				id: 'refresh',
				label: 'Refresh Frequency',
				tooltip: 'Reload current weather after # of minutes',
				width: 6,
				default: '20',
				regex: Regex.NUMBER,
			},
		]
		return configs
	}

	/**
	 * Setup the actions.
	 *
	 * @since 2.0.0
	 */
	init_actions() {
		this.setActionDefinitions({
			refresh: {
				name : 'Refresh',
				options: [],
				callback: async (action, context) => {
					this.refresh()
				},
			},
		})
	}

	/**
	 * Generate the feedbacks available
	 *
	 * @param {Object} self - 'this' from the module's context
	 * @since 2.0.0
	 */
	init_feedbacks(self) {
		// only one, replace button 'background' with
		// the recommended Icon from OpenWeather
		const feedbacks = {
			icon: {
				type: 'advanced',
				label: 'Current Condition Icon',
				description: 'Change background to icon of current weather',
				options: [],
				callback: function (feedback, bank) {
					let ret
					if (self.icons[self.iconID]) {
						ret = { png64: self.icons[self.iconID] }
						ret.bgcolor = self.isDay ? combineRgb(200, 200, 200) : combineRgb(16, 16, 16)
						ret.color = self.isDay ? combineRgb(32, 32, 32) : combineRgb(168, 168, 168)
					}
					if (ret) {
						return ret
					}
				},
			},
		}
		this.setFeedbackDefinitions(feedbacks)
	}

	/**
	 * initialize internal status variables
	 * and the variable definitions available to companion
	 *
	 * @since 2.0.0
	 */
	init_vars() {
		let vars = []

		this.weather = {
			location: {},
			current: {},
			forecast: {},
		}
		this.update = this.config.refresh * 60000
		this.lastPolled = 0
		this.icons = {}
		this.iconID = ''
		this.mph = 'i' != this.config.units
		this.hasError = false
		for (let i in VARIABLE_LIST) {
			vars.push({ variableId: i, name: VARIABLE_LIST[i].description })
		}
		this.setVariableDefinitions(vars)
	}

	/**
	 * build presets for the buttons
	 *
	 * @since 2.0.0
	 */
	init_presets() {
		const presets = [
			{
				type: 'button',
				category: 'Example',
				label: 'Condition Graphic & Current Temp',
				bank: {
					style: 'png',
					text: '$(ow:c_text)\\n$(ow:c_temp)',
					size: '18',
					color: combineRgb(255, 255, 255),
					bgcolor: 0,
				},
				steps: [
					{
						down: [],
						up: [],
					},
				],
				feedbacks: [
					{
						type: 'icon',
						options: {},
					},
				],
			},
		]
		this.setPresetDefinitions(presets)
	}

	/**
	 * initialize the API connection
	 *
	 * @since 2.0.0
	 */
	init_connection() {
		let self = this

		if (this.client) {
			delete this.client
		}
		if (this.heartbeat) {
			clearInterval(this.heartbeat)
			delete this.heartbeat
		}
		this.client = new rest_client()

		// only connect when API key is defined
		if (this.config.apikey === undefined || this.config.apikey == '') {
			this.updateStatus(InstanceStatus.BadConfig, "Missing API key")
			return
		}

		this.updateStatus(InstanceStatus.Connecting)

		this.client.on('error', function (err) {
			this.updateStatus(InstanceStatus.ConnectionFailure, err)
			this.hasError = true
		})

		// check every minute
		this.heartbeat = setInterval(function () {
			self.pulse(self)
		}, 60000)
		// starting now :)
		this.refresh()
	}

	/**
	 * Check if over 20 minutes since last refresh
	 *
	 * @since 2.0.0
	 */
	pulse(self) {
		let short = self.lastPolled + self.update - Date.now()
		// if over 20 minutes then refresh
		if (short <= 0) {
			self.refresh()
		}
	}

	/**
	 * Submit a new query for the most recent data
	 *
	 * @since 2.0.0
	 */
	refresh() {
		let units = this.config.units == 'i' ? 'imperial' : 'metric'
		let self = this

		// Only query if more than 1 minute since last poll
		if (!self.hasError && self.lastPolled + 60000 <= Date.now()) {
			let url = `${BASE_URL}?q=${self.config.location}&units=${units}&appid=${self.config.apikey}`
			self.lastPolled = Date.now()
			self.client
				.get(url, function (data, response) {
					if (data.error) {
						self.log('error', data.error.message)
						self.updateStatus(InstanceStatus.UnknownError, data.error.message)
						self.hasError = true
					} else if (response.statusCode == 200) {
						self.updateStatus(InstanceStatus.Ok, 'Connected')
						self.log('info','Weather data updated')
						self.update_variables(data)
					} else {
						self.log('error', data.message)
						self.updateStatus(InstanceStatus.UnknownError, data.message)
						self.init_vars()
						self.setVariableValues({ l_name: data.message })
					}
				})
				.on('error', function (err) {
					let emsg = err.message
					self.log('error', emsg)
					self.updateStatus(InstanceStatus.Error, emsg)
				})
		}
	}

	/**
	 * update the module variables
	 *
	 * @param {Object} data - information returned from the API
	 * @since 2.0.0
	 */
	update_variables = function (data) {
		let self = this

		let v = VARIABLE_LIST
		let dv = ''
		let dt = data.dt
		let tz = data.timezone

		self.weather = data

		// Additional 'date' formatting funcitons
		Date.prototype.toHHMM = function () {
			return ('00' + this.getHours()).slice(-2) + ':' + ('00' + this.getMinutes()).slice(-2)
		}

		Date.prototype.toMMDD_HHMM = function () {
			return ('00' + (this.getMonth() + 1)).slice(-2) + '-' + ('00' + this.getDate()).slice(-2) + ' ' + this.toHHMM()
		}

		for (let i in v) {
			let k = v[i].section
			switch (k) {
				case '':
					dv = data[v[i].data]
					break
				case 'main':
					dv = Math.floor(data.main[v[i].data] + 0.49) + C_DEGREE
					break
				case 'sys':
				case 'wind':
					dv = data[k][v[i].data]
					if (i == 'c_wind') {
						dv = Math.floor(dv * 10 + 4.9) / 10
					}
					break
				case 'weather':
					dv = data.weather[0][v[i].data]
					// get/update the corresponding graphic
					this.update_graphic(data.weather)
					break
				case 'internal':
					if (i == 'c_winddir') {
						const d = data.wind.deg
						dv = C_WINDIR[Math.floor((d % 360) / 22.5 + 0.5) % 16]
					} else if (i == 'c_day') {
						dv = dt > data.sys.sunrise && dt < data.sys.sunset
						this.isDay = dv
					}
					break
				case 'time':
					switch (i) {
						case 'c_time':
							dv = new Date(dt * 1000).toMMDD_HHMM()
							break
						case 'c_sunrise':
							dv = new Date(data.sys.sunrise * 1000).toHHMM()
							break
						case 'c_sunset':
							dv = new Date(data.sys.sunset * 1000).toHHMM()
							break
					}
					break
				case 'forecast':
					break
			}
			self.setVariableValues({ [i]: dv })
		}
	}

	/**
	 * Update the feedback icon when requested
	 *
	 * @param {Object} cond - current 'conditions' with recommended Icon ID
	 * @since 2.0.0
	 */

	update_graphic = function (cond) {
		const code = cond[0].icon
		let self = this

		if (code != self.iconID) {
			self.iconID = code
			// cached?
			if (self.icons[code]) {
				self.checkFeedbacks('icon')
			} else {
				// retrieve icon
				self.client
					.get(`http://openweathermap.org/img/wn/${code}@2x.png`, function (data, response) {
						if (response.statusCode == 200) {
							Jimp.read(Buffer.from(data)).then((image) => {
								image.resize(72, 72)
								.getBuffer(Jimp.MIME_PNG, function (err, buffer) {
									self.icons[code] = buffer.toString('base64')
									self.checkFeedbacks('icon')
								})
							})
						}
						// self.icons[code] = data.toString('base64');
						// self.checkFeedbacks('icon');}
					})
					.on('error', function (err) {
						let emsg = err.message
						self.log('error', emsg)
						self.updateStatus(InstanceStatus.Error, emsg)
					})
			}
		}
	}

}

runEntrypoint(OWInstance, UpgradeScripts)
