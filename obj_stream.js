require("./node-fluent-ffmpeg/lib/fluent-ffmpeg.js");

function stream(Ffmpeg)
{
	if(Ffmpeg === undefined)
		this.Ffmpeg = new FfmpegCommand();
	else
		this.Ffmpeg = Ffmpeg;
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
	//this.Ffmpeg._currentOutput.seg_opts_begin = this.Ffmpeg._currentOutput.options.list.length;

	var segment_options = ["-f segment"];
	for(option_name in options)
		segment_options.push("-" + option_name + " " + options[option_name]);
	this.Ffmpeg.addOutputOptions(segment_options);

	//this.Ffmpeg._currentOutput.seg_opts_end = this.Ffmpeg._currenOutput.options.list.length - 1;
};

stream.prototype.run = function()
{
	this.Ffmpeg.run();
};

global.stream = stream;
