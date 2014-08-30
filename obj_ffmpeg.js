function ffmpeg_input(option, name)
{
	this.option = option;
	this.name = name
}

function ffmpeg_output(option, name)
{
	this.option = option;
	this.name = name;
}

function ffmpeg()
{
	this.program_location;
	// ffmpeg synnopsis : ffmpeg [global_options] {[input_file_options] -i input_file} ... {[output_file_options] output_file} ...
	this.global_option = [];
	this.input_list = [];
	this.output_list = [];
}

ffmpeg.prototype.set_program_location = function(program_location)
{
	this.program_location = program_location;
}

ffmpeg.prototype.add_input = function(option, name)
{
	this.input_list.push(ffmpeg_input(option, name));
}

ffmpeg.prototype.add_output = function(option, name)
{
	this.output_list.push(ffmpeg_output(option, name));
}

ffmpeg.prototype.execute = function(args)
{
	var cmd = this.program_location + "ffmpeg";

	if(args === undefined)
	{
	}
	else
	{
		cmd += " " + args;
	}

	var ffmpeg_instance = require("child_process").exec(cmd);

	ffmpeg_instance.stdout.on("data",
		function(data)
		{
			LOG.debug("ffmpeg stdout : \n" + data);
		});

	ffmpeg_instance.stderr.on("data",
		function(data)
		{
			LOG.warn("ffmpeg stderr : \n" + data);
		});
}

ffmpeg.prototype.test = function()
{
	var test_cmd = "/home/kentlai/dev/test/lobby/IC_ffmpeg_API/ffmpeg -override_ffserver -f x11grab -s 1366x702 -i :0.0 -i ../home/kent/Downloads/FFmpeg_Logo_new.svg.png -filter_complex \"overlay='x=main_w-overlay_w:y=main_h-overlay_h',drawtext='box=1:boxcolor=black@0.2:fontcolor=white:fontsize=64:textfile=wm_text.txt:reload=1:x=(w-tw)/2:y=(h-th-lh)/2',drawtext='box=1:boxcolor=white@0.2:fontcolor=black:fontsize=64:text=%{localtime}:x=0:y=0',split='3' [fin1][fin2][fin3]\" -map [fin1] -f segment -segment_time 5 ../home/kent/Videos/test_%d.mpg -map [fin2] -qmax 2 http://10.21.21.160:8090/feed1.ffm -map [fin3] ../home/kent/Videos/test_full.mpg";

	var child = require('child_process').exec(test_cmd,
			function(error, stdout, stderr)
			{
				//console.log('stdout : ' + stdout);
				LOG.debug('stdout : ' + stdout);
				//console.log('stderr : ' + stderr);
				LOG.warn('stderr : ' + stderr);
				if(error !== null)
				{
					//console.log('exec error : ' + error);
					LOG.warn('exec error : ' + error);
				}
			});
}

global.ffmpeg = ffmpeg;
