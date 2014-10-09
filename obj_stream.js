var FfmpegCommand = require("./node-fluent-ffmpeg/lib/fluent-ffmpeg.js");
var fs = require("fs");
var watch = require("./watch/main.js");

function stream(Ffmpeg)
{
	if(Ffmpeg === undefined)
		this.Ffmpeg = new FfmpegCommand();
	else
		this.Ffmpeg = Ffmpeg;

	this.crnt_input_index;
	this.crnt_output_index;
	this.crnt_filter_index;
	this.filter_graph = [];
	this.monitors = [];
	this.Ffmpeg.on("start", function(commandLine)
		{
			LOG.warn("ffmpeg command : " + commandLine + "\n");
		});

	var stream_this = this;
	this.Ffmpeg.on("end", function()
		{
			while(stream_this.monitors.length > 0)
			{
				stream_this.monitors.shift().stop();
				LOG.warn("close monitor\n");
			}
		});
}

stream.prototype.showParameters = function()
{
	console.log(this.Ffmpeg);
};

stream.prototype.addInput = function(filename)
{
	this.Ffmpeg.addInput(filename);
	this.crnt_input_index = this.Ffmpeg._inputs.length - 1;
	return this.Ffmpeg;
};

stream.prototype.addOutput = function(filename)
{
	this.Ffmpeg.addOutput(filename);
	this.crnt_output_index = this.Ffmpeg._outputs.length - 1;
	return this.Ffmpeg;
};

stream.prototype.split = function(args)
{
	var filter_object = args;
	filter_object.filter = "split";
	this.crnt_filter_index = this.filter_graph.push(filter_object) - 1;
	return this;
};

stream.prototype.map = function(link, output_index)
{
	if(typeof output_index === "number")
	{
		var tmp = this.Ffmpeg._currentOutput;
		this.Ffmpeg._currentOutput = this.Ffmpeg._outputs[output_index];
		this.Ffmpeg.addOutputOptions("-map", "[" + link + "]");
		this.Ffmpeg._currentOutput = tmp;
	}
	else
	{
		this.Ffmpeg.addOutputOptions("-map", "[" + link + "]");
	}
	return this;
};

stream.prototype.set_segment_options = function(options, output_index)
{
	if(typeof ouput_index === "number")
	{
		var tmp =  this.Fffmpeg._currentOuput;
		this.Ffmpeg._currentOuput = this.Ffmpeg._ouputs[ouput_index];

		this.Ffmpeg._currentOutput.seg_opts_begin = this.Ffmpeg._currentOutput.options.get().length;

		var segment_options = ["-f segment"];
		for(option_name in options)
			segment_options.push("-" + option_name + " " + options[option_name]);
		this.Ffmpeg.addOutputOptions(segment_options);

		this.Ffmpeg._currentOutput.seg_opts_end = this.Ffmpeg._currentOutput.options.get().length - 1;

		this.Ffmpeg._currentOuput = tmp;
	}
	else
	{
		this.Ffmpeg._currentOutput.seg_opts_begin = this.Ffmpeg._currentOutput.options.get().length;

		var segment_options = ["-f segment"];
		for(option_name in options)
			segment_options.push("-" + option_name + " " + options[option_name]);
		this.Ffmpeg.addOutputOptions(segment_options);

		this.Ffmpeg._currentOutput.seg_opts_end = this.Ffmpeg._currentOutput.options.get().length - 1;
	}
	return this;
};

stream.prototype.add_output_with_segment_options = function(options, filename)
{
	var dir_sep = filename.lastIndexOf("/");
	var dir = "./";
	if(dir_sep >= 0)
		dir = filename.substr(0, dir_sep + 1);
	var fn = filename.substr(dir_sep + 1, filename.length - (dir_sep + 1));

	var extn_sep = fn.lastIndexOf(".");
	var extn = "";
	if(extn_sep >= 0)
	{
		extn = fn.substr(extn_sep, fn.length - extn_sep);
		fn = fn.substr(0, extn_sep);
	}

	this.addOutput(dir + fn + "__%d" + extn);
	this.set_segment_options(options);

	var stream_this = this;
	var ptn = new RegExp(fn + "__" + "[0-9]+" + extn);
	watch.createMonitor(dir, function(monitor)
		{
			monitor.on("created", function(f, stat)
				{
					//LOG.warn("crt : " + f + "\n");
					var date = new Date();
					if(ptn.test(f))
					{
						fs.rename(f, dir + fn + "_" + date.toISOString() + extn);
						LOG.warn(f + " rename to " + dir + fn + "_" + date.toISOString() + extn + "\n");
					}
				}
			);
			stream_this.monitors.push(monitor);
		}
	);
	return this.Ffmpeg;
};

stream.prototype.draw_text = function(args)
{
	var filter_object = args;
	filter_object.filter = "drawtext"
	this.crnt_filter_index = this.filter_graph.push(filter_object) - 1;
	return this;
};

stream.prototype.run = function(callback)
{
	if(callback && typeof callback === "function")
		this.Ffmpeg.on("error", callback);
	if(this.filter_graph.length > 0)
		this.Ffmpeg.complexFilter(this.filter_graph);
	this.Ffmpeg.run();
};

module.exports = stream;
