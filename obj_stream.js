require("./node-fluent-ffmpeg/lib/fluent-ffmpeg.js");

function stream(Ffmpeg)
{
	if(Ffmpeg === undefined)
		this.Ffmpeg = new FfmpegCommand();
	else
		this.Ffmpeg = Ffmpeg;

	this.filter_graph = [];
	this.Ffmpeg.on("start", function(commandLine)
		{
			LOG.warn("ffmpeg command : " + commandLine + "\n");
		});
}

stream.prototype.addInput = function(filename)
{
	this.Ffmpeg.addInput(filename);
	return this.Ffmpeg._inputs.length - 1;
};

stream.prototype.addOutput = function(filename)
{
	this.Ffmpeg.addOutput(filename);
	return this.Ffmpeg._outputs.length - 1;
};

stream.prototype.set_segment_options = function(options, output_index)
{
	//this.test = "Hello World!";
	//LOG.warn("begin : " + this.Ffmpeg._currentOutput.options.get().length + "\n");
	this.Ffmpeg._currentOutput.seg_opts_begin = this.Ffmpeg._currentOutput.options.get().length;

	var segment_options = ["-f segment"];
	for(option_name in options)
		segment_options.push("-" + option_name + " " + options[option_name]);
	this.Ffmpeg.addOutputOptions(segment_options);

	//LOG.warn("end : " + (this.Ffmpeg._currentOutput.options.get().length - 1) + "\n");
	this.Ffmpeg._currentOutput.seg_opts_end = this.Ffmpeg._currentOutput.options.get().length - 1;
};

stream.prototype.draw_text = function(args, IO_link)
{
	var filter_name = "drawtext";

	var param_strings = [];
	for(param in args)
		param_strings.push(param + "=" + args[param]);

	var filter_string = filter_name + "=\'" + param_strings.join(":") + "\'";

	if(IO_link !== undefined)
	{
		if(typeof IO_link.in_link === "string")
			filter_string = "[" + IO_link.in_link + "]" + filter_string;

		if(typeof IO_link.out_link === "string")
			filter_string += "[" + IO_link.out_link + "]";
	}	
	LOG.warn("drawtext filter string : " + filter_string + "\n");

	return this.filter_graph.push(filter_string) - 1;

/*
	var filter_object = {filter : filter_name, options : args};
	if(IO_link !== undefined)
	{
		if(IO_link.in_link !== undefined)
			filter_object.inputs = IO_link.in_link;

		if(IO_link.out_link !== undefined)
			filter_object.outputs = IO_link.out_link;
	}	

	return this.filter_graph.push(filter_object) - 1;
*/

};

stream.prototype.run = function()
{
	this.Ffmpeg.complexFilter(this.filter_graph);
	this.Ffmpeg.run();
};

global.stream = stream;
