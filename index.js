// OpenWeather.com interface

var rest_client 	= require('node-rest-client').Client;
var instance_skel 	= require('../../instance_skel');
var sharp			= require('sharp');
var rgb 			= require('../../image').rgb;
var debug;
var log;

// 1 day forecast (today) includes projected hi/low temps as well as current forecast
instance.prototype.base = "https://api.openweathermap.org/data/2.5/weather";

instance.prototype.C_DEGREE = String.fromCharCode(176);

instance.prototype.C_WINDIR = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

instance.prototype.VARIABLE_LIST = {
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
	c_winddir: { description: 'Wind direction', section: 'internal'}


};


function instance(system, id, config) {
	var self = this;

	// super-constructor
	instance_skel.apply(this, arguments);

	// addUpdateScript would go here

	return self;
}

instance.prototype.init = function () {
	var self = this;

	// init vars
	debug = self.debug;
	log = self.log;

	self.init_vars();

	// other init methods
	self.init_feedbacks();
	self.init_connection();
	//self.init_presets();
};

instance.prototype.updateConfig = function (config) {
	var self = this;

	debug = self.debug;
	log = self.log;

	// save passed config
	self.config = config;

	// tear everything down
	self.destroy();

	// ... and start again
	self.init_feedbacks();
	self.init_connection();
	//self.init_presets();
};

instance.prototype.destroy = function () {
	var self = this;

	self.init_vars();
	self.client = null;
};


/* --- init --- */

instance.prototype.config_fields = function () {

	var self = this;

	self.defineConst('REGEX_HEX','/^[0-9A-Fa-f]+$/');

	var configs = [
		{
			type: 	'text',
			id: 	'info',
			width: 	12,
			label: 	'Information',
			value: 	'This module retrieves weather information from OpenWeather.com.<br>It requires an active internet connection.'
		},
		{
			type: 'textinput',
			id: 'apikey',
			label: 'API Key',
			width: 12,
			tooltip: 'Enter your API Key from OpenWeather.com.',
			regex: self.REGEX_HEX
		},
		{
			type: 'textinput',
			id: 'location',
			label: 'Location',
			tooltip: 'Weather Location to Display',
			width: 12
		},
		{
			type: 'dropdown',
			id:	 'units',
			label: 'Measurement Units',
			width: 6,
			default: 'i',
			choices: [
				{ id: 'i', label: 'Fahrenheit and MPH' },
				{ id: 'm', label: 'Celsius and kPH' }
			]
		}
	];
	return configs;
};

instance.prototype.init_actions = function () {

	var self = this;

	self.system.emit('instance_actions', self.id, {
		'refresh': { label: 'Refresh weather display' }
	});
};

instance.prototype.init_feedbacks = function () {

	var self = this;

	// feedbacks
	var feedbacks = {
		'icon': {
			label: 'Current Condition Icon',
			description: 'Change background to icon of current weather',
			options: [],
			callback: function(feedback, bank) {
				var ret;
				if (self.icons[self.iconID]) {
					ret = { png64: self.icons[self.iconID] };
					ret.bgcolor = (self.isDay ? rgb(200,200,200): rgb(16,16,16));
					ret.color = (self.isDay ? rgb(32,32,32) : rgb(200,200,200));
				}
				if (ret) {
					return ret;
				}
			}
		}
	};
	self.setFeedbackDefinitions(feedbacks);
};

instance.prototype.init_vars = function () {
	var self = this;
	var vars = [];

	self.weather = {
		location: {},
		current: {},
		forecast: {}
	};
	self.lastPolled = 0;
	self.icons = {};
	self.iconID = '';
	self.mph = ('i' != self.config.units);
	self.hasError = false;
	for (var i in self.VARIABLE_LIST) {
		vars.push( { name: i, label: self.VARIABLE_LIST[i].description});
	}
	self.setVariableDefinitions(vars);
};

instance.prototype.init_presets = function () {
	var self = this;

	var presets = [
		{
			category: 'Example',
			label: 'Condition Graphic & Current Temp',
			bank: {
				style: 'png',
				text: '$(ow:c_temp)',
				size: '18',
				color: rgb(255,255,255),
				bgcolor: 0
			},
			actions: [
				{
					action: 'refresh',
					options: {}
				}
			],
			feedbacks: [
				{
					type: 'icon',
					options: {}
				}
			]
		}
	];
	self.setPresetDefinitions(presets);
};


instance.prototype.init_connection = function () {
	var self = this;
	var base = self.base;

	if (self.client) {
		delete self.client;
	}
	if (self.heartbeat) {
		clearInterval(self.heartbeat);
		delete self.heartbeat;
	}
	self.client = new rest_client();

	// only connect when API key is defined
	if (self.config.apikey === undefined || self.config.apikey == "") {
		return false;
	}

	self.status(self.STATUS_UNKNOWN, 'Connecting');

	self.client.on('error', function(err) {
		self.status(self.STATUS_ERROR, err);
		self.hasError = true;
	});

	// check every minute
	self.heartbeat = setInterval(function() { self.pulse(); }, 60000);
	self.refresh();
};

/* --- update current weather --- */

instance.prototype.pulse = function () {
	var self = this;

	// if over 20 minutes then refresh
	if (self.lastPolled + 20 * 60000 < Date.now() ) {
		self.refresh();
	}
};

instance.prototype.refresh = function () {
	var self = this;
	var units = (self.config.units == 'i' ? 'imperial' : 'metric');

	// Only query if more than 1 minute since last poll
	if (!self.hasError && self.lastPolled + 60000 < Date.now()) {
		self.lastPolled = Date.now();
		var url = self.base + "?q=" + self.config.location +"&units=" + units + "&appid=" + self.config.apikey;
		self.client.get(url, function (data, response) {
			if (data.error) {
				self.log('error', data.error.message);
				self.status(self.STATUS_ERROR, data.error.message);
				self.hasError = true;
			} else if (response.statusCode == 200) {
				self.status(self.STATUS_OK);
				self.update_variables(data);
			} else {
				self.status(self.STATUS_ERROR, data.message);
			}
		});
	}
};

instance.prototype.update_variables = function(data) {
	var self = this;
	var k;
	var v = self.VARIABLE_LIST;
	var dv;
	var dt = data.dt;
	var tz = data.timezone;

	self.weather = data;

	Date.prototype.toHHMM = function() {
		return ('00' + this.getHours()).slice(-2) + ':' + ('00' + this.getMinutes()).slice(-2);
	}

	Date.prototype.toMMDD_HHMM = function() { 
		return ('00' + (this.getMonth() + 1)).slice(-2) + '-' + ('00' + this.getDate()).slice(-2) + ' ' + this.toHHMM();
	}

	for (var i in v) {
		k = v[i].section;
		switch (k) {
		case '':
			dv = data[v[i].data];
			break;
		case 'main':
			dv = Math.floor(data.main[v[i].data] + .49) + self.C_DEGREE;
			break;
		case 'sys':
		case 'wind':
			dv = data[k][v[i].data];
			break;
		case 'weather':
			dv = data.weather[0][v[i].data];
			// get/update the corresponding graphic
			self.update_graphic(data.weather);
			break;
		case 'internal':
			if (i=='c_winddir') {
				var d = data.wind.deg;
				dv = self.C_WINDIR[Math.floor((d % 360) / 22.5 + 0.5)];
			} else if (i=='c_day') {
				dv = (dt > data.sys.sunrise && dt < data.sys.sunset);
				self.isDay = dv;
			}
			break;
		case 'time':
			switch (i) {
			case 'c_time':
				dv = new Date(dt * 1000).toMMDD_HHMM();
				break;
			case 'c_sunrise':
				dv = new Date(data.sys.sunrise * 1000).toHHMM();
				break;
			case 'c_sunset':
				dv = new Date(data.sys.sunset * 1000).toHHMM();
			}
			
		case 'forecast':
			break;
		}
		self.setVariable(i, dv);
	}
};

instance.prototype.update_graphic = function(cond) {
	var self = this;
	var code = cond[0].icon;

	if (code != self.iconID) {
		self.iconID = code;
		// cached?
		if (self.icons[code]) {
			self.checkFeedbacks('icon');
		} else {
			self.client.get("http://openweathermap.org/img/wn/" + code + "@2x.png" , function (data, response) {
				//
				if (response.statusCode == 200) { 
				sharp(new Buffer(data)).resize(72,72).png().toBuffer(function (err, buffer) {
					self.icons[code] = buffer;
					self.checkFeedbacks('icon');
				  });
				}
				// self.icons[code] = data.toString('base64');
				// self.checkFeedbacks('icon');
			});
		}
	}
};

instance.prototype.action = function (action) {

	var self = this;
	var cmd;

	switch (action.action) {

	case "refresh":
		self.refresh();
		break;

	}
};

instance_skel.extendedBy(instance);
exports = module.exports = instance;