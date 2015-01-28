/*
//
//
// ic_video.js
//
// video streaming
//
*/

require("./imFfmpeg.js");
// default settings can be modified 
var ffmpegAutoReconnectThreshold = 3; // 自動重新連接 ffmpeg 失敗超過此值，即發通知
var maxListNum = 100; 
var maxCacheNum = 5;
var videoChannelDB = "videoChannels";
var cacheAddress = "swap/"; 
var snapshotAddress = "web/snapshot/";
//var videoStorageAddress = "video/";
//var snapshotStoredAddress = "web/snapshotStored/";
IC.DB.useCollections([videoChannelDB]);

//-----------------------------------------
// define local variables
//
//-----------------------------------------

// reference to video object
var l_videoStreamPool = {}; // stores all channel
var l_debug = {};
var l_status = {};

var spawn = require('child_process').spawn, exec = require('child_process').exec;

//-----------------------------------------
// define local functions
//
//-----------------------------------------
var l_videoLossEvent = function (arg) {
	console.log("The video loss event is triggered.");
	console.log("The video loss event is triggered.");
	console.log("The video loss event is triggered.");
	console.log("The video loss event is triggered.");
	console.log("The video loss event is triggered.");
	console.log("The video loss event is triggered.");
	console.log("The video loss event is triggered.");
	console.log("The video loss event is triggered.");
  console.log(arg);
};


var l_findOldest = function (arg) {

	var findOldestCmd = "find " + snapshotAddress + " -type f -printf '%T@ %p\n' | sort -n | cut -f2- -d' ' | sed -e     's/EndTS.*//g' | sed -e 's/[0-9]*-$//g' | uniq | head -1 "; //找出最舊的
	exec(findOldestCmd, function (error, stdout, stderr) {
		console.log(stdout);
		var oldest = /startTS.*$/.exec(stdout.replace('\n',''));
		if (oldest && oldest[0]) {
			console.log(oldest);
			console.log("Now, oldest is " + oldest[0]);
			l_status.oldest = {year: oldest[0].substring(7,11), month: oldest[0].substring(11,13), day: oldest[0].substring(13,15) };
			console.log(l_status.oldest);
		}
  });
}
l_findOldest({});

var l_checkStreaming = function (id) {
	var formatData = {}
	if (l_videoStreamPool[id]) {
		formatData.connect = 1;
	} else {
		formatData.connect = 0;
	}
	return formatData;
};

var l_getCollection = function (clt_name, onFail) {
}

var l_db_setChannel = function (data) {

	//console.log("l_db_setChannel: %j", data);

	var x = {
		id: data.id,
		desc: data.desc,
		in: data.in,
		out: data.out,
		name: data.name,
		status: data.status,
	};

	IC.DB.updateData(videoChannelDB, {id: data.id}, x, 
		function (){
			console.log("db setdata success");
		}, 
		function () {
			console.log("db setdata not success");
	}); 
}

var l_partiallyUpdate = function (origin, update) {
	if (Object.keys(update).length > 0) {
		for (var key in update) {
			if (update[key] || update[key] === '' || update[key] === 0) {
				origin[key] = update[key];
			};
		};
	};
};


function getTimestamp() {
	var date = new Date();
	var hour = date.getHours();
	hour = (hour < 10 ? "0" : "") + hour;
	var min	= date.getMinutes();
	min = (min < 10 ? "0" : "") + min;
	var sec	= date.getSeconds();
	sec = (sec < 10 ? "0" : "") + sec;
	var year = date.getFullYear();
	var month = date.getMonth() + 1;
	month = (month < 10 ? "0" : "") + month;
	var day	= date.getDate();
	day = (day < 10 ? "0" : "") + day;
	return year + "" + month + "" + day + "-" + hour + "" + min + "" + sec;
}

////////////////////////////////
// Find the longest common starting substring in a set of strings
// input: ["strings"]
// output: string
////////////////////////////////
function sharedStart(array){
	var A = array.slice(0).sort(), 
	word1 = A[0], word2 = A[A.length-1], 
	L = word1.length, i = 0;
	while( i < L && word1.charAt(i) === word2.charAt(i) ) {
		i++;
	}

	return word1.substring(0, i);
}


///////////////////////////// stable
// clean 'null' elements for an array
// input: array
// output: array
/////////////////////////////
function cleanArray(actual){
	var newArray = new Array();
	for(var i = 0; i<actual.length; i++){
			if (actual[i]){
				newArray.push(actual[i]);
		}
	}
	return newArray;
}
/*
Array.prototype.clean = function(deleteValue) {
	for (var i = 0; i < this.length; i++) {
		if (this[i] == deleteValue) {				 
			this.splice(i, 1);
			i--;
		}
	}
	return this;
};
// http://stackoverflow.com/questions/281264/remove-empty-elements-from-an-array-in-javascript
// test = new Array("","One","Two","", "Three","","Four").clean("");
*/


///////////////////////////////// stable
// to check whether available partition space is sufficient or insufficient
// input: {videoDisk: ["mount point"], spare: number (MB), onDone: callback function}
// output:	
/////////////////////////////////
var checkDisk = function (cmd) {
	if ( ! cmd ) {
		console.log("error: cmd is necessary");
		return;
	}

	if ( ! cmd.videoDisk ) {
		console.log("error: no videoDisk");
		return;
	}
	
	if (typeof cmd.videoDisk	!== 'object' ) {
		console.log("error: videoDisk should be an array");
		return;
	}
	
	if ( ! cmd.spare ) {
		console.log("error: no spare");
		return;
	}
	//console.log(typeof cmd.spare);
	if (typeof cmd.spare !== 'number' ) {
		console.log("error: spare shoud be a number");
		return;
	}
	 
	exec("df --block-size=M", 
	function (error, stdout, stderr) {
		//console.log(stdout);
		var list = stdout.split("\n");
		for (var i in list) {
			list[i] = cleanArray(list[i].split(" "));
			//console.log("found / : " + list[i].indexOf("/"));
			for (var j in cmd.videoDisk) {
				if (list[i].indexOf(cmd.videoDisk[j]) == 5) {
					//console.log(list[i][5] + " remaining disk space: " + list[i][3]);
					// 這裡要寫判斷是否空間不足
					if ( parseInt(list[i][3].replace("M", "")) < cmd.spare ) {
						// 若空間不足，則執行 callback function
						if (cmd && cmd.onInsufficientSpace && typeof cmd.onInsufficientSpace === 'function') {
							//console.log("running callback");
							cmd.onInsufficientSpace(list[i][5]);
						}
					}
					else {
						//console.log("enough space: " + list[i][5]);
					}
				}
			}
		}
		
		//console.log(list);
	}, 
	function (error, stdout, stderr) {
	});

}




////////////////////////////////////// stable
// setChannel
// input: { id: channel_id "optional", in: ["rtsp://..."], out: ["output_filename"], descritpion: "", name: "" }
// output: true if success | false if not success | channel_id if new 
//////////////////////////////////////
exports.setChannel = function (data) {
	//console.log("data: %j", data);
	//console.log("l_videoStreamPool: %j", l_videoStreamPool);

	//todo: 檢查是否已經有完全一樣內容的物件


	//todo: partial update
	if (data.id) {
		if (l_videoStreamPool[data.id]) { 
			//delete l_videoStreamPool[data.id];
			//l_videoStreamPool[data.id] = {};
			//l_videoStreamPool[data.id] = data;
			l_partiallyUpdate(l_videoStreamPool[data.id], data);
			l_db_setChannel(l_videoStreamPool[data.id]); // problem
			data.onDone({id: data.id, message: "updated" });
			return true;
		} 
		else {
			LOG.warn("incorrect id of channel");
			data.onDone({error: "id is invalid"});
			return false;
		}
	} 
	else {
		if (data.options !== "allowDuplication" ) {
			// to check if
			for ( var i in l_videoStreamPool ) {
				if ( l_videoStreamPool[i].in[0] === data.in[0]) 
					console.log("duplicated input!");
					if (data.onDone && typeof data.onDone === 'function') {
						data.onDone({error: "duplicate"});
					}
					return;
			}
		}
		else {
		}
		
		// to create a new channel
		var id = IC.Utility.createUUID();
		data.id = id;
		data.errorCount = 0;
		l_videoStreamPool[id] = data;
		l_db_setChannel(l_videoStreamPool[id]);
		if (data.onDone && typeof data.onDone === 'function') {
			data.onDone({id: data.id, message: "created"});
		}
		return id;
	}
}


/////////////////////////////////////// stable
// sync channel information from DB to memory and get available channels
// input: {id: channel_id}
// output {"channel information"} | false if not success | undefined if not exists | {"all channel information"} if channel_id not assigned
///////////////////////////////////////
var getChannel = exports.getChannel = function (channel_data) {
	//console.log("in exports.getChannel");
	if ( ! channel_data.onDone ) {
		console.log("xxxxxxxxxxx no .onDone");
		return false;
	}
	
	if ( ! typeof channel_data.onDone === 'function' ) {
		console.log("xxxxxxxxxxx .onDone is not a function");
		return false;
	}
	
	// if channel data in db are already loaded
	/*
	if ( l_videoStreamPool.length > 0) {
		if ( channel_data.id && typeof channel_data.id === 'string' ) {
			if (l_videoStreamPool[channel_data.id]) {
				channel_data.onDone( l_videoStreamPool[channel_data.id] );
			}
			else {
				channel_data.onDone({});
			}
		}
		else {
			channel_data.onDone( l_videoStreamPool);
		}
		return;
	};
	console.log("yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy");
	*/
	
	// load channel data from db
	IC.DB.getArray(videoChannelDB,	
	function (db_data) {
		//console.log("data restoring: %j", db_data);
		for (var i in db_data) { 
			console.log(i);
			console.log(db_data[i]);
			l_videoStreamPool[db_data[i].id] = db_data[i];
			delete l_videoStreamPool[db_data[i].id]._id;
		}

		if ( channel_data.id && typeof channel_data.id === 'string' ) {
			if (l_videoStreamPool[channel_data.id]) {
				channel_data.onDone( l_videoStreamPool[channel_data.id] );
			}
			else {
				channel_data.onDone({});
			}
		}
		else {
			channel_data.onDone( l_videoStreamPool);
		}
	}, 
	function (db_data) {
		console.log("fail = data restoring");
		console.log(db_data);
		return false;
	});
}


/////////////////////////////////////// stable
// delete a single channel 
// input: {id: "channel_id"} 
// output: true if success | false if not success
///////////////////////////////////////
exports.deleteChannel = function (data) {
	if ( ! data.id ) {
		console.log("id must be assigned");
		return;
	}
	
	if ( ! typeof data.id === 'string' ) {
		console.log("id must be a string");
		return;
	}
	
	if ( ! l_videoStreamPool[data.id] ) {
		console.log("channel id does not exist");
		return;
	}
	
	delete l_videoStreamPool[data.id];

	IC.DB.deleteData(videoChannelDB, 
	function (re) {
		console.log("deleteData success");
	}, 
	function (re) {
		console.log("deleteData fail");
	}, {id: data.id});
}


///////////////////////////////////// stable
// get active channels and inactive channels
// input: {}
// output: {active: ["channel_id"], inactive: ["channel_id"]}
/////////////////////////////////////
exports.getStatus = function (data) {
	var active = [];
	var inactive = [];
	for (var key in l_videoStreamPool){
		if ( l_videoStreamPool[key].process ) {
			active.push(key);
		}
		else {
			inactive.push(key);
		}
	}
	console.log(l_videoStreamPool);
	console.log("active: %j", active);
	console.log("inactive: %j", inactive);
	return {active: active, inactive: inactive};
}

var l_set_channel_captions = function(channel_id)
{
	if(!l_videoStreamPool[channel_id])
	{
		LOG.warn("channel does not exist\n");
		return false;
	}
	var channel = l_videoStreamPool[channel_id];

	if(!channel.captions)
	{
		LOG.warn("captions setting does not exist\n");
		return false;
	}

	if(channel.captions.vsrc === undefined)
	{
		LOG.warn("video source of captions does not specify\n");
		return false;
	}

	if(!channel.imFfmpeg)
	{
		LOG.warn("ffmpeg does not exist\n");
		return false;
	}

	if(channel.captions.label)
	{
		LOG.warn("captions label have been created\n");
		return false;
	}

	var imFfmpeg = channel.imFfmpeg;
	var captions = channel.captions;

	imFfmpeg.draw_text(captions.vsrc, captions.text_settings[0].text, channel_id + "_" + 0, captions.text_settings[0].args);
	for(var i = 1; i < captions.text_settings.length; i++)
	{
		imFfmpeg.draw_text(channel.id + "_" + (i - 1), captions.text_settings[i].text, channel.id + "_" + i, captions.text_settings[i].args);
	}

	channel.captions.label = channel.id + "_" + (captions.text_settings.length - 1);

	return true;
}

///////////////////////////////////////////
// set caption text for a channel
// input: {id: "channel_id", captions:["caption text"] }
// output: true if success | false if not success 
///////////////////////////////////////////
exports.setCaptionText = function(data)
{
	if(!data.id)
	{
		LOG.warn("channel id does not specify\n");
		return false;
	}
	if(!l_videoStreamPool[data.id])
	{
		LOG.warn("channel does not exist\n");
		return false;
	}

	if(!l_videoStreamPool[data.id].imFfmpeg)
	{
		LOG.warn("ffmpeg does not exist\n");
		return false;
	}

	if(!l_videoStreamPool[data.id].captions.label)
	{
		LOG.warn("captions label does not exist\n");
		return false;
	}

	if(!data.modify_caption)
	{
		LOG.warn("modify caption text dose not setting\n");
		return false;
	}

	l_videoStreamPool[data.id].imFfmpeg.modify_text(data.modify_caption.text, data.modify_caption.index);

	return true;
}

//////////////////////////////////////
// to start record for a video channel 
// input:
// output: 
/////////////////////////////////////
var l_startRecord = function (data) {
	var url = l_videoStreamPool[data.id].in[0];

	if ( ! typeof url === 'string' ) {
		console.log("url is not a string");
		return;
	}
	
	if ( ! url.match(/^rtsp:\/\//) ) {
		console.log("url does not match");
		return;
	}

	if (l_videoStreamPool[data.id] && l_videoStreamPool[data.id].process) {
		console.log("already actived: " + data.id);
		return; 
		//l_videoStreamPool[data.id].process.kill('SIGHUP');
	};

	var timestamp = getTimestamp();
	var mkdircmd = "mkdir -pv " + snapshotAddress + data.id + " " + cacheAddress + data.id ;
	exec(mkdircmd, 
	function (error, stdout, stderr ) {});

	var dt_args1 = {options : {box : 1, boxcolor : "black@0.2", fontcolor : "white", fontsize : 64, x : "(w-tw)/2", y : "(h-th-lh)/2"}};

	var dt_args2 = {options : {box : 1, boxcolor : "white@0.2", fontcolor: "black", fontsize : 16, x : "0", y : "0"}};
 
	var dt_args3 = {options : {fontcolor: "red", fontsize : 32, x : "w-tw", y : "h-th"}};

	l_videoStreamPool[data.id].captions = {
			vsrc: 0,
			text_settings: [
				{text: "Hello World", args: dt_args1},
				{text: "%{localtime}", args: dt_args2},
				{text: "Alert", args: dt_args3},
			]
	};

	var imFfmpeg = create_imFfmpeg();
	l_videoStreamPool[data.id].imFfmpeg = imFfmpeg;
	for(var i = 0; i < l_videoStreamPool[data.id].in.length; i++)
	{
		imFfmpeg.add_input(l_videoStreamPool[data.id].in[i]);
	}

	var seg_opts = {
		segment_time : 5, 
		reset_timestamps : 1,
		segment_atclocktime : 1,
		segment_wrap : maxListNum,
		segment_list : cacheAddress + data.id + "-xxx",
		segment_list_size : maxCacheNum - 1,
		segment_list_type : "flat",
		segment_list_flags : "live"

	};

	var dir = "/home/kentlai/dev/test/seg/";
	var dup_outputs = [
		{name : dir + data.id + "_test1.mpeg", label : "TEST1", segment : {options : {segment_time : 10}}, size : "50%"},
		{name : dir + data.id + "_test2.mpeg", segment : {options : {segment_time : 15}}, size : {w : 1024, h : 768}},
		{name : cacheAddress + data.id + "/" + data.id + "-startTS" + timestamp + "-EndTS-video-.mp4", segment : {options : seg_opts}},
		{name : snapshotAddress + data.id + "/" + data.id + "-startTS" + timestamp + "-EndTS-image-%1d.jpg", options : ["-r 1"]}
	];

	if(l_set_channel_captions(data.id))
	{
		imFfmpeg.create_multiple_outputs(l_videoStreamPool[data.id].captions.label, dup_outputs);
	}
	else
	{
		imFfmpeg.create_multiple_outputs(0, dup_outputs);
	}

/*
	var command = {
		// ffmpeg 指令來源
		ffmpeg: 'ffmpeg',
		// 影像輸入指令
		input: [
			'-i', l_videoStreamPool[data.id].in[0],
			'-force_key_frames', '0,0.1'
		],
		// 影像輸出指令
		output: [
			// 前端串流用
			[
				'-c', 'copy',
				//'-map', '0:0', // 只取影像，若要取聲音請改成 0
				//'-map','0', // 有取聲音， but 比較不穩
				'-map', '0:0',
				'-f', 'ssegment',
				'-segment_time', '5', // 間隔 5 秒
				'-reset_timestamps', '1',
				'-segment_atclocktime','1',
				'-segment_format', 'mp4',
				'-segment_wrap', maxListNum,
				'-segment_list', cacheAddress + data.id + "-xxx",
				'-segment_list_size', maxCacheNum - 1,
				'-segment_list_type', 'flat',
				'-segment_list_flags', 'live',
				cacheAddress + data.id + '/' + data.id + '-startTS' + timestamp + '-EndTS-video-%1d.mp4',
			],
			[ // 前端顯示用 
				'-r', '1',
				'-f', 'image2', 
				snapshotAddress + data.id + "/" + data.id + '-startTS' + timestamp + '-EndTS-image-%1d.jpg'	
			]
		]
	};

	var option = command.input;
	for (var key in command.output) {
		option = option.concat(command.output[key]);
	};
	console.log("starting ffmpeg option: " + option);
*/

	imFfmpeg.Run();

	imFfmpeg.on("error", function(err, stdout, stderr)
		{
			LOG.warn("err: " + err + "\n");
		}
	);
	imFfmpeg.on("start", function(commandLine)
		{
			l_videoStreamPool[data.id].process = imFfmpeg.ffmpegProc;

			imFfmpeg.ffmpegProc.stdout.on("data", function(data)
				{
					console.log("stdout: " + data);
				}
			);

			if(l_debug.ffmpegVerbose)
			{
				imFfmpeg.dump_stderr = true;
			}

	l_videoStreamPool[data.id].timestamp = timestamp
	

	imFfmpeg.ffmpegProc.on('close', function (code) {
		LOG.warn('stream: ' + data.id + ' is down (cleaup and closing inotifywait)');
		
		//LOG.event();
		var pid = this.pid;
		try {
			for (var key in l_videoStreamPool) {
				//console.log(">>>>>> key %j", l_videoStreamPool[key]);
				//console.log(">>>>>> key " + key + " " + " " + pid);
				if (l_videoStreamPool[key] && l_videoStreamPool[key].process && l_videoStreamPool[key].process.pid)
				if (l_videoStreamPool[key].process.pid === pid) {
					// cleanup inotifywait
					if (l_videoStreamPool[key].inotifywait) {
						console.log("closing inotifywait");
						//~ l_videoStreamPool[key].inotifywait.close( function (err) { if (err){console.log("Error when closing inotifywait: " + err)}} );
						//~ l_videoStreamPool[key].inotifywait.close();
						l_videoStreamPool[key].inotifywait.kill();
						delete l_videoStreamPool[key].inotifywait;
					};
					delete l_videoStreamPool[key].process;
				} 
				else {
					//console.log("l_videoStreamPool[key].process.pid" + l_videoStreamPool[key].process.pid);
				};
			};
		} catch (e) {
			console.log("error: process on close");
			console.log(e);
		}
	});
		}
	);
	
/*	
  l_videoStreamPool[data.id].inotifywait = IC.fs.watch(snapshotAddress + data.id, {persistent: true}, function (event, filename) {
    console.log(" " + event + " " + filename);
  });
*/	

	l_videoStreamPool[data.id].inotifywait = spawn("inotifywait", ["-m","-e", "CLOSE_WRITE", snapshotAddress + data.id ]);
	
	l_videoStreamPool[data.id].inotifywait.stderr.on('data', function (data) {
			// apt-get install inotify-tools 
			console.log('inotifywait-stderr: ' + data);
	});
	
	l_videoStreamPool[data.id].inotifywait.stdout.on('data', function (dat) {
			//console.log('inotifywait-stdout: ') 
			//console.log(dat.toString());

			//if ( data.toString().indexOf("EndTS") == -1) {
				//console.log("repeated");
			//}
			//else {
				
				var msg = dat.toString().split(' ');
				//console.log(msg);
				if ( msg[2].indexOf('EndTS') < 1) {
					console.log("debug please");
					return ;
				}
				msg[3] = msg[2];
				//console.log("msg[2]: " + msg[2]);
				msg[3] = msg[2].replace("EndTS", "endTS" + getTimestamp());
				//var mvcmd = "mv -v " + snapshotAddress + data.id + "/" + msg[2].replace("\n", " ") + " " + snapshotAddress + data.id + "/" + msg[3].replace("\n", " ");
				//console.log("mvcmd: " + mvcmd);
				//return;
				var lncmd = "cd " + snapshotAddress + data.id + ";pwd; unlink " + data.id + "currentSnapshot.jpg; ln -sv " + msg[2].replace("\n", " ") + " " + data.id + "currentSnapshot.jpg ";
				exec(lncmd, 
				function (err, stdout, stderr) {
					//console.log(err);
					//console.log(stdout);
					//console.log(stderr);
				});
			//}
	});
	
	l_videoStreamPool[data.id].inotifywait.on('close', function (code) {
		LOG.warn('inotifywait: ' + data.id + ' is down');
		var pid = this.pid;
		try {
			for (var key in l_videoStreamPool) {
				//console.log(">>>>>> key %j", l_videoStreamPool[key]);
				//console.log(">>>>>> key " + key + " " + " " + pid);
				if (l_videoStreamPool[key] && l_videoStreamPool[key].inotifywait && l_videoStreamPool[key].inotifywait.pid)
				if (l_videoStreamPool[key].inotifywait.pid === pid) {
          //~ l_videoStreamPool[key].inotifywait.close(function (err) { if (err){console.log("Error when closing inotifywait: " + err}});
					delete l_videoStreamPool[key].inotifywait;
				} 
				else {
					//console.log("l_videoStreamPool[key].process.pid" + l_videoStreamPool[key].process.pid);
				};
			};
		} catch (e) {
			console.log("error: process on close");
			console.log(e);
		}
	});

	//data.onDone();
	return true;
	//};
}


/////////////////////////////////////// stable
// starting a recording for a channel
// input: {id: "channel_id"}
// output: true if success | false if not success 
///////////////////////////////////////
var startRecord = exports.startRecord = function (data) {
	console.log(data);

	if ( ! data.id ) {
		console.log("id must be assigned");
		//to do: 自動啟動 .status="on" 
		return false;
	}

	if ( typeof data.id !== 'string' ) {
		console.log("error: id input must be a string");
		return false;
	} 
	else if ( ! l_videoStreamPool[data.id] ) {
		console.log("error: profile is not existing %j", l_videoStreamPool);
		console.log(l_videoStreamPool[data.id]);
		return false;
	}

	l_videoStreamPool[data.id].status = "recording";
	//l_partiallyUpdate(l_videoStreamPool[data.id], {status: "recording"});
	l_db_setChannel(l_videoStreamPool[data.id]);
	
	l_startRecord(data);
}


////////////////////////////////////// stable
// stop a video recording 
// input: {id: channel_id}
// output: true if exists a channel_id | false if exists no channel_id
//////////////////////////////////////
exports.stopRecord = function (data) {
	//console.log(data);
	if ( ! data.id ) {
		console.log("id must be assigned");
		return;
	}
	
	if( ! l_videoStreamPool[data.id] ) {
		console.log("id does not exist");
		return;
	} 
	
	// 刪除 ffmpeg/inotifywait child process
	l_videoStreamPool[data.id].status = "off";
	//l_partiallyUpdate(l_videoStreamPool[data.id], {status: "off"});
	l_db_setChannel(l_videoStreamPool[data.id]);
	if (l_videoStreamPool[data.id] && l_videoStreamPool[data.id].process && l_videoStreamPool[data.id].process.kill ) {
		l_videoStreamPool[data.id].process.kill('SIGHUP');
	}
	//~ if (l_videoStreamPool[data.id] && l_videoStreamPool[data.id].inotifywait && l_videoStreamPool[data.id].inotifywait.kill ) {
		//~ l_videoStreamPool[data.id].inotifywait.kill('SIGHUP');
	//~ }
	if (l_videoStreamPool[data.id] && l_videoStreamPool[data.id].inotifywait ) {
		console.log("closing inotifywait");
		//~ l_videoStreamPool[data.id].inotifywait.close( function (err) { if (err){console.log("Error when closing inotifywait: " + err)}} );
		//~ l_videoStreamPool[data.id].inotifywait.close();
		l_videoStreamPool[data.id].inotifywait.kill();
		delete l_videoStreamPool[data.id].inotifywait;
	}
	
	return true;
}


///////////////////////////////////////////
// to stop all recording channels
// 
//
///////////////////////////////////////////
exports.stopAllRecord = function (data) {


}



//////////////////////////////////////
//query : start, end time, cam_id, //for playback 
// input: {id: "channel_id", type: "snapshot | originalVideo | highResolution | lowResoluation", start: {year: 2014, month: 11, day: 11, hour: 11, minute: 11, second: 12}, end: {year: 2014, month: 12, day: 23, hour: 10, minute: 10, second: 10}
// output: {file: ["filename with url", ""], start: ["video's starting time"], length:["time length of video"] } 
//////////////////////////////////////
exports.queryStored = function (data) {
	if ( ! data.onDone || typeof data.onDone !== 'function') {
		console.log("incorrect callback must be assigned");
		return;
	}
	
	if (data.startDateTime[0] > 2034 || data.startDateTime[0] < 2014) 
		data.startDateTime[0] = 2014;
	if (data.startDateTime[1] > 12 || data.startDateTime[1] < 1) 
		data.startDateTime[1] = 12;
	if (data.startDateTime[2] > 31 || data.startDateTime[2] < 1) 
		data.startDateTime[2] = 25;
	if (data.startDateTime[3] > 23 || data.startDateTime[3] < 0) 
		data.startDateTime[3] = 12;
	if (data.startDateTime[1] > 12 || data.startDateTime[1] < 1) 
		data.startDateTime[1] = 12;
	if (data.startDateTime[1] > 12 || data.startDateTime[1] < 1) 
		data.startDateTime[1] = 12;
	if (data.startDateTime[1] > 12 || data.startDateTime[1] < 1) 
		data.startDateTime[1] = 12;

	console.log(data.startDateTime);
	console.log(data.endDateTime);
	//var startDateTime = [2014, 12, 22, 15, 55, 15];
	//var endDateTime = [2014, 12, 22, 17, 29, 53];

	IC.Utility.findFiles({path: snapshotAddress + data.id, option: "mtime", onDone: function (result) {
		
	}});
return;
	switch (data.type) {
		case 'snapshot':
			//var cmd = "rm /tmp/hydra_queryStored-; touch -t " + datetime + " /tmp/hydra_queryStored- ; find " + snapshotAddress + " --newer /tmp/hydra_queryStored-" ;// find " + snapshotAddress + " -type f "; //'ls -t ' + snapshotAddress + '' + data.id + "-" + l_videoStreamPool[data.id].timestamp + '*image*.jp*g | head ';
			var cmd1stage = "find " + snapshotAddress + data.id + " -type f| sed 's/web.*startTS//g'| sed 's/-EndTS.*jpg//g'| sort| uniq";
				console.log(cmd1stage);
						exec(cmd1stage , function (err, stdout, stderr) {
							//problem: 如果 stdout 太長，會被截掉後段，因此要想辦法讓 bash 回傳的資料不要太長 
							//console.log("stdout: " + stdout);
							var list = stdout.split('\n');
							//console.log(list);
							var numbered = [];

							// 年月日時分秒比較大小
							var compareTime = function (arr1, arr2) {
								if ( arr1[0] < arr2[0] ) return 1;
								else if ( arr1[0] > arr2[0]) return -1;
								else if ( arr1[1] < arr2[1]) return 1;
								else if ( arr1[1] > arr2[1]) return -1;
								else if ( arr1[2] < arr2[2]) return 1;
								else if ( arr1[2] > arr2[2]) return -1;
								else if ( arr1[3] < arr2[3]) return 1;
								else if ( arr1[3] > arr2[3]) return -1;
								else if ( arr1[4] < arr2[4]) return 1;
								else if ( arr1[4] > arr2[4]) return -1;
								else if ( arr1[5] < arr2[5]) return 1;
								else if ( arr1[5] > arr2[5]) return -1;
								else return 0;
							}

							//numbering 
							for (var i in list) {
								numbered[i] = [];
								numbered[i][0] = parseInt(list[i].substring(0,4)); 
								numbered[i][1] = parseInt(list[i].substring(4,6)); 
								numbered[i][2] = parseInt(list[i].substring(6,8)); 
								numbered[i][3] = parseInt(list[i].substring(9,11)); 
								numbered[i][4] = parseInt(list[i].substring(11,13)); 
								numbered[i][5] = parseInt(list[i].substring(13,15)); 
								numbered[i][6] = compareTime(numbered[i], data.startDateTime);
								numbered[i][7] = compareTime(numbered[i], data.endDateTime);
							}
							//console.log(numbered);
							//console.log(start);
							//console.log(end);
							for (var i in numbered) {
								if ( numbered[i-1]
									&& numbered[i-1][6] && numbered[i-1][6] === 1 
									&& numbered[i-1][7] && numbered[i-1][7] === 1 
									&& numbered[i][6] && numbered[i][6] === 1 
									&& numbered[i][6] && numbered[i][7] === 1) 
									delete numbered[i-1];
								if (numbered[i][6] === -1 && numbered[i][7] === -1 )
									delete numbered[i] ;
							}
							var candidate = cleanArray(numbered);
							var can_len = candidate.length;
							delete candidate[can_len-1];
							candidate = cleanArray(candidate);
							//console.log(candidate);
							//console.log(candidate.length);
							var finalResult = [];
							var finalResultCount = 0;
							for (var i in candidate) {
								var year = candidate[i][0].toString();
								var month = candidate[i][1].toString(); 
								var day = candidate[i][2].toString();
								var hour = candidate[i][3].toString();
								var minute = candidate[i][4].toString();
								var second = candidate[i][5].toString();
								if ( month.length === 1 ) month = "0" + month;
								if ( day.length === 1 ) day = "0" + day;
								if ( hour.length === 1 ) hour = "0" + hour;
								if ( minute.length === 1 ) minute = "0" + minute;
								if ( second.length === 1 ) second = "0" + second;

								var cmd2stage = "ls -t " + snapshotAddress + data.id + "/*startTS" + year + month + day + "-" + hour + minute + second +	"* | head --lines=1 ";
								//console.log("cmd2stage: " + cmd2stage);
								exec(cmd2stage, function(err,stdout,stderr){
									finalResult.push(stdout.replace('\n',''));
									//console.log("++Count: " + finalResult.length + " " + candidate.length );
									if (finalResult.length == candidate.length) {
										data.onDone({snapshotList: finalResult});
										//console.log(finalResult);
									}
									else {
										finalResultCount++;
									}
								});
							} 
					 });

			break;
		case 'originalVideo':
			break;

		default:
			break;
	}



}


////////////////////////////////////////
// query live snapshot or video 
// input: {id: ["channel_id"], type: "snapshot"}
// output: {["uri for snapshot or video"]} 
////////////////////////////////////////
exports.queryLive = function (data) {

	if ( ! data.onDone) {
		console.log("callback must be assigned");
		return;
	}
	
	if ( ! typeof data.onDone === 'function') {
		console.log("callback function must be assigned");
		return;	
	}
	
		switch (data.type) {
		case 'snapshot':
			var cmd = 'ls -t ' + snapshotAddress + '' + data.id + "/" + data.id + "-" + "startTS" + l_videoStreamPool[data.id].timestamp + '*image*.jp*g | head ';
			//console.log(cmd);
						exec(cmd , 
						function (err, stdout, stderr) {
							//console.log("stdout" + stdout);
							var list = stdout.split('\n');
							console.log(list);
							data.onDone({snapshotLive: list[1]});
					 });
			break;

		case 'originalVideo':
			if ( ! l_videoStreamPool[data.id] ) {
				console.log("no assigned channel: " + data.id );
				return;
			}

			if ( ! l_videoStreamPool[data.id].timestamp ) {
				console.log("no timestamp");
				return;
			}

			// 這裡分成二種情況: 1)如果沒有指定 num 直接找倒數第二新檔; 2)如果有指定 num 則要判斷此檔之存在且非最新檔

			var cmd = 'ls -t ' + cacheAddress + '' + data.id + "/" + data.id + "-" + "startTS" + l_videoStreamPool[data.id].timestamp + '*video*.mp4 | head -5 ';
			//console.log("cmd:" + cmd);
			var assigned = cacheAddress + '' + data.id + "/" + data.id + "-" + "startTS" + l_videoStreamPool[data.id].timestamp + '-EndTS-video-' + data.num + '.mp4';
			//console.log("assigned: " + assigned);
						exec(cmd , 
						function (err, stdout, stderr) {
							//console.log("stdout" + stdout);
							var list = stdout.split('\n');
							//console.log("list");
							//console.log(list);
							var number = [];
							var position = 0;
							for (var i in list) {
								if ( list[i] ) {
									number[i] = list[i].match(/-video-.*.mp4/);
									number[i] = number[i][0].replace("-video-","").replace(".mp4","");
									
									if ( assigned === list[i] ) {
										position = i;
									}
								}
							}
							//console.log("number " + position);
							//console.log(number);

							//console.log("num: " + number);
							var result = {};
							if ( data.num ) {
								// 為了防止取到 ffmpeg 仍在寫的檔案， list[0] 要避免使用
								if (position === 0){
									result = {};
								}
								else if (position > 0 ) {
									result = {video: list[position], num: data.num, position: position};
									//console.log("result");
									//console.log(result);
								}
								data.onDone(result);
							}
							else {
								result = {video: list[1], num: number[1], position: 1};
								//console.log("result");
								//console.log(result);
								data.onDone(result);
							}
					 });
			break;

		default:
			break;
	}


	if ( data.id ) {
		if ( l_videoStreamPool[data.id] ) {
			if ( l_videoStreamPool[data.id].process ) {
				
			} 
			else {
				
			}
		} 
		else {
			console.log("The channel does not exist.");
			return false;
		}
	} 
	else {
		console.log("The channel id must be assigned.");
		return false;
	}


}


///////////////////////////////////////////
// set caption text for a channel
// input: {id: "channel_id", caption:["caption text"] }
// output: true if success | false if not success 
///////////////////////////////////////////
exports.setCaptionText = function (data) {
}


///////////////////////////////////////////
// get caption text for a channel
// input: {id: "channel_id"}
//
///////////////////////////////////////////
exports.getCaptionText = function (data) {
}


/////////////////////////////////////////
// return the oldest searchable video file
// 
/////////////////////////////////////////
exports.getOldestSearchable = function (arg) {
  return l_status.oldest;
}



////////////////////////////////////
// to run some functions automatically
// input: "start" | "stop" 
// output: true if success | false if not success
////////////////////////////////////
var daemonX = {};
exports.daemon = function (data) {

	if (data.action === 'start') { 
		daemonX.schedule = setInterval(function(){
			//console.log("daemon" + new Date());
			
			// 目前記憶體中 channel 數量
			var numberOfChannel = Object.keys(l_videoStreamPool).length;
			//console.log("number of channel: " + Object.keys(l_videoStreamPool).length);
			if ( Object.keys(l_videoStreamPool).length == 0 ) {
				getChannel({onDone: function (arg) {}});
				return; 
			}
			
			// 自動檢查 錄影 schedule 時間到了 


			// 自動檢查 磁碟空間接近不足 
			checkDisk({videoDisk: ["/data"], spare: 2300, critcal: 1000, onInsufficientSpace: 
			function (mountpoint) {
				console.log("The callback onInsufficientSpace is triggered. " + mountpoint ); 
				 
				if ( data.onInsufficientSpace ) {
					//if callback is given.
					if ( typeof data.onInsufficientSpace === 'function') {
						data.onInsufficientSpace(data);
					}
				} 
				else if ( ! data.onInsufficientSpace ) {
					// if callback is not given, then 1) delete some oldest video files 2) stop all recording.
					var action = "delete_old";
					if ( action === "delete_old" ) {
						if (true) {
							// http://stackoverflow.com/questions/4561895/how-to-recursively-find-the-latest-modified-file-in-a-directory
							var find_old_cmd = "find " + snapshotAddress + " -type f -printf '%T@ %p\n' | sort -n | cut -f2- -d' ' | sed -e 's/EndTS.*//g' | sed -e 's/[0-9]*-$//g' | uniq | head -12 "; //一口氣刪掉12天
							exec(find_old_cmd, function (error, stdout, stderr) {
								//console.log(stdout);
								var old_list = stdout.split('\n');
								delete old_list[old_list.length - 1];
								old_list = IC.Utility.cleanArray(old_list);
								//console.log(old_list);

								for (var i in old_list) {
									if ( old_list[i] ) {
										var delete_old_cmd = "rm -v " + old_list[i] + "*";
										exec(delete_old_cmd, function (error, stdout, stderr) {
										  //console.log(stdout);
											l_findOldest({});
										});
									}
								}
							});
						}
					} 
					else if ( action === "stop_record" ) {
					}
				}
				//console.log("insufficient space: " + mountpoint);
				//	找最舊的 n 個檔案，刪掉 n-1 及更舊的檔案，並把第 n 個記下來更新至資料庫中	
				//exec(" find -type f -printf '%T+ %p\n' | sort --reverse | head --lines=10 ", 
				//function (error, stdout, stderr) {
				
				//});
			}, onStopRecord: function (arg) {
				// 刪檔來不及，強制停止所有 video channel 
				
			}});


			// 自動清除 cache 




			// 自動重新連接本來應該連著的 channel 
			for (var key in l_videoStreamPool) {
				if ( l_videoStreamPool[key].status && l_videoStreamPool[key].status === 'recording' && ! l_videoStreamPool[key].process ) {
					console.log("auto-reconnecting " + key + " " + l_videoStreamPool[key].status + " " + l_videoStreamPool[key].autoReconnectCount );
					l_startRecord({id: key});
					//todo: 如果以前重連失敗, 現在又重連成功, 則通知成功 

					if ( typeof l_videoStreamPool[key].autoReconnectCount === 'number') {
						if ( l_videoStreamPool[key].autoReconnectCount > ffmpegAutoReconnectThreshold ) {
							// 自動重連數次失敗即通知，但只通知一次即可
							l_videoLossEvent(l_videoStreamPool[key]);
							l_videoStreamPool[key].autoReconnectCount = 0;
						}
						else {
						  l_videoStreamPool[key].autoReconnectCount++;
						}
					} 
					else if (typeof l_videoStreamPool[key].autoReconnectCount === 'undefined') {
						l_videoStreamPool[key].autoReconnectCount = 0;
					}
				}
			}

		}, 7000);
		console.log("IC.Video daemon start ");
	}
	else if (data.action === 'stop') {
		clearInterval(daemonX.schedule);
		console.log("IC.Video daemon stop ");
	}
	else {
		console.log("{ start | stop }");
	}
}


////////////////////////////////////
// just for debug
// input: {action: "action"}
// output: none
////////////////////////////////////
exports.debug = function (data) {
	switch (data.action) {
		case 'ffmpegVerboseOn': 
			console.log("ffmpegVerbose on");
			l_debug.ffmpegVerbose = true;
			break;
		case 'ffmpegVerboseOff':
			console.log("ffmpegVerbose off");
			l_debug.ffmpegVerbose = false;
			break;
		case 'show':
			console.log(l_debug);
			break;
		case 'verboseOn':
			l_debug.verbose = true;
			break;
		case 'verboseOff':
			l_debug.verbose = false;
			break;
		default:
		break;
	}
}

/*
待解問題:
磁碟空間不足執行刪檔或停止
由於舊檔會不斷被刪，因此要記錄目前可查詢的最舊檔日期

*/
