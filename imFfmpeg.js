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
	imFfmpeg.tmp_input = null;
	imFfmpeg.tmp_output = null;
	imFfmpeg.textfiles = [];
	imFfmpeg.crnt_textfile_index = null;
	imFfmpeg.dump_stderr = false;

	imFfmpeg.on("start", function(commandLine)
		{
			LOG.warn("ffmpeg command : " + commandLine + "\n");

			if(imFfmpeg.dump_stderr)
			{
				imFfmpeg.ffmpegProc.stderr.on("data", function(data)
					{
						LOG.warn(data + "\n");
					}
				);
			}
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

	imFfmpeg.on("error", function(err, stdout, stderr)
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

	imFfmpeg.set_input = function(input_index)
	{
		imFfmpeg.tmp_input = imFfmpeg._currentInput;
		imFfmpeg._currentInput = imFfmpeg._inputs[input_index];
		return imFfmpeg;
	};

	imFfmpeg.add_output = function(filename)
	{
		imFfmpeg.addOutput(filename);
		imFfmpeg.crnt_output_index = imFfmpeg._outputs.length - 1;
		return imFfmpeg;
	};

	imFfmpeg.set_output = function(output_index)
	{
		imFfmpeg.tmp_output = imFfmpeg._currentOutput;
		imFfmpeg._currentOutput = imFfmpeg._outputs[output_index];
		return imFfmpeg;
	};

	imFfmpeg.split = function(args)
	{
		var filter_object = args;
		filter_object.filter = "split";
		imFfmpeg.crnt_filter_index = imFfmpeg.filter_graph.push(filter_object) - 1;
		return imFfmpeg;
	};

	imFfmpeg.map = function(link_label, output_index)
	{
		if(typeof output_index === "number")
		{
			var tmp = imFfmpeg._currentOutput;
			imFfmpeg._currentOutput = imFfmpeg._outputs[output_index];
			imFfmpeg.addOutputOptions("-map", "[" + link_label + "]");
			imFfmpeg._currentOutput = tmp;
		}
		else
		{
			imFfmpeg.addOutputOptions("-map", "[" + link_label + "]");
		}
		return imFfmpeg;
	};

	imFfmpeg.create_multiple_outputs = function(in_link_label, new_outputs)
	{
		var split_args = {options : new_outputs.length, inputs : in_link_label, outputs : []};
		var i;
		for(i = 0; i < new_outputs.length; i++)
		{
			imFfmpeg.add_output(new_outputs[i].name);
			new_outputs[i].index = imFfmpeg.crnt_output_index;
			if(new_outputs[i].label === undefined)
				new_outputs[i].label = "out_link_label_" + new_outputs[i].index;
			split_args.outputs.push(new_outputs[i].label);
			imFfmpeg.map(new_outputs[i].label);
		}
		imFfmpeg.split(split_args);
		return imFfmpeg;
	};

	imFfmpeg.set_segment_options = function(options, output_index)
	{
		if(typeof output_index === "number")
		{
			var tmp =  imFfmpeg._currentOutput;
			imFfmpeg._currentOutput = imFfmpeg._outputs[output_index];

			imFfmpeg._currentOutput.seg_opts_begin = imFfmpeg._currentOutput.options.get().length;

			var segment_options = ["-f segment"];
			for(option_name in options)
				segment_options.push("-" + option_name + " " + options[option_name]);
			imFfmpeg.addOutputOptions(segment_options);

			imFfmpeg._currentOutput.seg_opts_end = imFfmpeg._currentOutput.options.get().length - 1;

			imFfmpeg._currentOutput = tmp;
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

	imFfmpeg.add_output_with_segment_options = function(options, filename, onDone)
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

		imFfmpeg.add_output(dir + fn + "_%d" + extn);
		this.set_segment_options(options);

		var ptn = new RegExp(fn + "_" + "[0-9]+" + extn);
		var pre_matches = [];
		watch.createMonitor(dir, function(monitor)
			{
				monitor.on("created", function(f, stat)
					{
						//LOG.warn("crt : " + f + "\n");
						if(ptn.test(f))
						{
							var first = true;
							for(var i = 0; i < pre_matches.length; i++)
							{
								if(f === pre_matches[i].f)
								{
									first = false;
									break;
								}
							}

							if(first)
							{
								/*
								for(var i = 0; i < pre_matches.length; i++)
								{
									LOG.warn(pre_matches[i].f + "\n");
								}
								*/
								var new_f = f.replace(extn, "") + "_" + stat.atime.toISOString() + extn;
								fs.rename(f, new_f, function(err)
									{
										if(err)
										{
											for(var i = 0; i < pre_matches.length; i++)
											{
												LOG.warn(pre_matches[i].f + "\n");
											}
											throw err;
										}
									}
								);
								LOG.warn("Rename " + f + " to " + new_f + "\n");
							}

							if(pre_matches.length >= 8)
								pre_matches.shift();
							pre_matches.push({f : f, stat : stat});
							if(typeof onDone === "function")
								onDone(new_f);
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
		filter_object.filter = "drawtext";
		imFfmpeg.crnt_filter_index = imFfmpeg.filter_graph.push(filter_object) - 1;
		if(filter_object.options.textfile)
			imFfmpeg.crnt_textfile_index = imFfmpeg.textfiles.push(filter_object.options.textfile) - 1;
		return imFfmpeg;
	};

	imFfmpeg.modify_text = function(text, textfile_index)
	{
		if(typeof textfile_index !== "number")
			textfile_index = imFfmpeg.crnt_textfile_index;

		if(typeof text === "string")
		{
			fs.writeFile(imFfmpeg.textfiles[textfile_index] + ".tmp", text, function(err)
				{
					if(err)
					{
						throw err;
					}
					fs.rename(imFfmpeg.textfiles[textfile_index] + ".tmp", imFfmpeg.textfiles[textfile_index]);
				}
			);
		}
		else
			if(Array.isArray(text))
			{
				var i;
				for(i = 0; i < text.length; i++)
				{
					fs.writeFile(imFfmpeg.textfiles[textfile_index] + ".tmp", text[i], function(err)
						{
							if(err)
							{
								throw err;
							}
							fs.rename(imFfmpeg.textfiles[textfile_index] + ".tmp", imFfmpeg.textfiles[textfile_index]);
						}
					);
				}
			}
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
