var FfmpegCommand = require("./node-fluent-ffmpeg/lib/fluent-ffmpeg.js");
var fs = require("fs");
var watch = require("./watch/main.js");

function create_imFfmpeg(Ffmpeg)
{
	if(Ffmpeg === undefined)
		imFfmpeg = new FfmpegCommand();
	else
		imFfmpeg = Ffmpeg;

	imFfmpeg.crnt_input_index = null;
	imFfmpeg.crnt_output_index = null;
	imFfmpeg.crnt_filter_index = null;
	imFfmpeg.filter_graph = [];
	imFfmpeg.monitors = [];

	imFfmpeg.on("start", function(commandLine)
		{
			LOG.warn("ffmpeg command : " + commandLine + "\n");
		}
	);

	imFfmpeg.on("end", function()
		{
			while(imFfmpeg.monitors.length > 0)
			{
				imFfmpeg.monitors.shift().stop();
				LOG.warn("close monitor\n");
			}
		}
	);

	imFfmpeg.showParameters = function()
	{
		console.log(imFfmpeg);
		return imFfmpeg;
	};

	imFfmpeg.add_input = function(filename)
	{
		imFfmpeg.addInput(filename);
		imFfmpeg.crnt_input_index = imFfmpeg._inputs.length - 1;
		return imFfmpeg;
	};

	imFfmpeg.add_output = function(filename)
	{
		imFfmpeg.addOutput(filename);
		imFfmpeg.crnt_output_index = imFfmpeg._outputs.length - 1;
		return imFfmpeg;
	};

	imFfmpeg.split = function(args)
	{
		var filter_object = args;
		filter_object.filter = "split";
		imFfmpeg.crnt_filter_index = imFfmpeg.filter_graph.push(filter_object) - 1;
		return imFfmpeg;
	};

	imFfmpeg.map = function(link, output_index)
	{
		if(typeof output_index === "number")
		{
			var tmp = imFfmpeg._currentOutput;
			imFfmpeg._currentOutput = imFfmpeg._outputs[output_index];
			imFfmpeg.addOutputOptions("-map", "[" + link + "]");
			imFfmpeg._currentOutput = tmp;
		}
		else
		{
			imFfmpeg.addOutputOptions("-map", "[" + link + "]");
		}
		return imFfmpeg;
	};

	imFfmpeg.set_segment_options = function(options, output_index)
	{
		if(typeof ouput_index === "number")
		{
			var tmp =  this.Fffmpeg._currentOuput;
			imFfmpeg._currentOuput = imFfmpeg._ouputs[ouput_index];

			imFfmpeg._currentOutput.seg_opts_begin = imFfmpeg._currentOutput.options.get().length;

			var segment_options = ["-f segment"];
			for(option_name in options)
				segment_options.push("-" + option_name + " " + options[option_name]);
			imFfmpeg.addOutputOptions(segment_options);

			imFfmpeg._currentOutput.seg_opts_end = imFfmpeg._currentOutput.options.get().length - 1;

			imFfmpeg._currentOuput = tmp;
		}
		else
		{
			imFfmpeg._currentOutput.seg_opts_begin = imFfmpeg._currentOutput.options.get().length;

			var segment_options = ["-f segment"];
			for(option_name in options)
				segment_options.push("-" + option_name + " " + options[option_name]);
			imFfmpeg.addOutputOptions(segment_options);

			imFfmpeg._currentOutput.seg_opts_end = imFfmpeg._currentOutput.options.get().length - 1;
		}
		return imFfmpeg;
	};

	imFfmpeg.add_output_with_segment_options = function(options, filename)
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

		imFfmpeg.add_output(dir + fn + "__%d" + extn);
		this.set_segment_options(options);

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

				imFfmpeg.monitors.push(monitor);
			}
		);

		return imFfmpeg;
	};

	imFfmpeg.draw_text = function(args)
	{
		var filter_object = args;
		filter_object.filter = "drawtext"
			imFfmpeg.crnt_filter_index = imFfmpeg.filter_graph.push(filter_object) - 1;
		return imFfmpeg;
	};

	imFfmpeg.Run = function(callback)
	{
		if(callback && typeof callback === "function")
			imFfmpeg.on("error", callback);
		if(imFfmpeg.filter_graph.length > 0)
			imFfmpeg.complexFilter(imFfmpeg.filter_graph);
		imFfmpeg.run();
	};
	return imFfmpeg;
}

global.create_imFfmpeg = create_imFfmpeg;
