/*
//
//
// ic_video.js
//
// video streaming
//
 */
// default settings can be modified in using
require("./imFfmpeg.js");
var videoChannelDB = "videoChannels";
var cacheAddress = "swap/"; 
var videoStorageAddress = "video/";
var snapshotAddress = "web/snapshot/";
IC.DB.useCollections(["videoChannels"]);

//-----------------------------------------
// define local variables
//
//-----------------------------------------

// reference to video object
var l_videoStreamPool = {};
var l_debug = {};

var spawn = require('child_process').spawn,
	exec = require('child_process').exec;

//-----------------------------------------
// define local functions
//
//-----------------------------------------
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
	var min  = date.getMinutes();
	min = (min < 10 ? "0" : "") + min;
	var sec  = date.getSeconds();
	sec = (sec < 10 ? "0" : "") + sec;
	var year = date.getFullYear();
	var month = date.getMonth() + 1;
	month = (month < 10 ? "0" : "") + month;
	var day  = date.getDate();
	day = (day < 10 ? "0" : "") + day;
	return year + "" + month + "" + day + "-" + hour + "" + min + "" + sec;
}

function cleanArray(actual){
	var newArray = new Array();
	for(var i = 0; i<actual.length; i++){
		if (actual[i]){
			newArray.push(actual[i]);
		}
	}
	return newArray;
}

var checkDisk = function (cmd) {
	if ( ! cmd.videoDisk ) {
		console.log("no videoDisk");
		return;
	}

	if (typeof cmd.videoDisk  !== 'object' ) {
		console.log("videoDisk should be an array");
		return;
	}

	if ( ! cmd.spare ) {
		console.log("no spare");
		return;
	}
	//console.log(typeof cmd.spare);
	if (typeof cmd.spare !== 'number' ) {
		console.log("spare shoud be a number");
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
			// ............
			if ( parseInt(list[i][3].replace("M", "")) < cmd.spare ) {
			// ......... callback function
			if (cmd && cmd.onDone && typeof cmd.onDone === 'function') {
			//console.log("running callback");
			cmd.onDone(list[i][5]);
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
			function (error, stdout, stderr) {});

}
//////////////////////////////////////
// setChannel
// input: { id: channel_id "optional", in: ["rtsp://..."], out: ["output_filename"], descritpion: "", name: "" }
// output: true if success | false if not success | channel_id if new 
//////////////////////////////////////
exports.setChannel = function (data) {
	//console.log("data: %j", data);
	//console.log("l_videoStreamPool: %j", l_videoStreamPool);

	//todo: 檢查是否完全一樣的物件

	//todo: partial update
	if (data.id) {
		if (l_videoStreamPool[data.id]) { 
			//delete l_videoStreamPool[data.id];
			//l_videoStreamPool[data.id] = {};
			//l_videoStreamPool[data.id] = data;
			l_partiallyUpdate(l_videoStreamPool[data.id], data);
			l_db_setChannel(l_videoStreamPool[data.id]); // problem
			return true;
		} 
		else {
			LOG.warn("incorrect id of channel");
			return false;
		}
	} 
	else {
		// to create a new channel
		var id = IC.Utility.createUUID();
		data.id = id;
		l_videoStreamPool[id] = data;
		l_db_setChannel(l_videoStreamPool[id]);
		return id;
	}
}


///////////////////////////////////////
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


///////////////////////////////////////
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


/////////////////////////////////////
// get active channels and inactive channels
// input: {}
// output: {active: ["channel_id"], inactive: ["channel_id"]}
/////////////////////////////////////
exports.getStatus = function (data) {
	var active = [];
	var inactive = [];
	for (var key in l_videoStreamPool){
		if (l_videoStreamPool[key].imFfmpeg) 
			active.push(l_videoStreamPool[key].id);
		else 
			inactive.push(l_videoStreamPool[key].id);
	}
	console.log("l_videoStreamPool: ");
	console.log(l_videoStreamPool);
	console.log("active: %j", active);
	console.log("inactive: %j", inactive);
	return {active: active, inactive: inactive};
}


///////////////////////////////////////
// starting a recording for a channel
// input: {id: "channel_id"}
// output: true if success | false if not success 
///////////////////////////////////////
exports.startRecord = function(data)
{
	if(!data.id)
	{
		console.log("id must be assigned");
		return false;
	}

	if(typeof data.id !== "string")
	{
		console.log("error: id input must be a string");
		return false;
	} 
	else
		if(!l_videoStreamPool[data.id])
		{
			console.log("error: profile is not existing %j", l_videoStreamPool);
			console.log(l_videoStreamPool[data.id]);
			return false;
		}

	if(l_videoStreamPool[data.id].imFfmpeg)
	{
		LOG.warn("id: " + data.id + " is recording");
		return false;
	}

	var imFfmpeg = create_imFfmpeg();
	l_videoStreamPool[data.id].imFfmpeg = imFfmpeg;
	for(var i = 0; i < l_videoStreamPool[data.id].in.length; i++)
	{
		imFfmpeg.add_input(l_videoStreamPool[data.id].in[i]);
	}

	var dir = "/home/kentlai/dev/test/seg/";
	var dup_outputs = [
		{name : cacheAddress + data.id + ".mpeg", segment : {segment_time : 5}},
		{name : videoStorageAddress + data.id + ".mpeg", segment : {segment_time : 3600}},
		{name : dir + data.id + "_test1.mpeg", label : "TEST1", segment : {segment_time : 10}, size : "50%"},
		{name : dir + data.id + "_test2.mpeg", segment : {segment_time : 15}, size : {w : 1024, h : 768}}
	];

	if(setCaptionText(data))
	{
		imFfmpeg.create_multiple_outputs(l_videoStreamPool[data.id].cap_label, dup_outputs);
	}
	else
	{
		imFfmpeg.create_multiple_outputs(0, dup_outputs);
	}

	//imFfmpeg.dump_stderr = true;
	imFfmpeg.on("end", function()
		{
			LOG.warn("end" + "\n");
			l_videoStreamPool[data.id].status = "off";
		}
	);
	imFfmpeg.on("error", function(err, stdout, stderr)
		{
			LOG.warn("err: " + err + "\n");
			l_videoStreamPool[data.id].status = "off";
		}
	);

	imFfmpeg.Run();

	l_videoStreamPool[data.id].status = "on";
	l_db_setChannel(l_videoStreamPool[data.id]);

	return true;
}


//////////////////////////////////////
// stop a video recording 
// input: {id: channel_id}
// output: true if exists a channel_id | false if exists no channel_id
//////////////////////////////////////
exports.stopRecord = function (data)
{
	if(!l_videoStreamPool[data.id] || !l_videoStreamPool[data.id].status || l_videoStreamPool[data.id].status === "off")
	{
		return false;
	} 
	if(l_videoStreamPool[data.id].status === "on" && l_videoStreamPool[data.id].imFfmpeg)
	{
		l_videoStreamPool[data.id].status = "off";
		l_videoStreamPool[data.id].imFfmpeg.kill();
		delete l_videoStreamPool[data.id].imFfmpeg;
		return true;
	};
}


//////////////////////////////////////
//query : start, end time, cam_id, 
//for playback 
// input: {type: "snapshot | originalVideo"}
// output: {} 
//////////////////////////////////////
exports.queryStored = function (data) {
	switch (data.type) {
		case 'snapshot':

			break;
		case 'originalVideo':
			break;

		default:
			break;
	}

}


///////////////////////////////////////////
// set caption text for a channel
// input: {id: "channel_id", caption:["caption text"] }
// output: true if success | false if not success 
///////////////////////////////////////////
exports.setCaptionText = setCaptionText = function(data)
{
	if((!data.captions || !Array.isArray(data.captions) || data.cap_vsrc === undefined || !l_videoStreamPool[data.id].imFfmpeg) && (!l_videoStreamPool[data.id].captions || l_videoStreamPool[data.id].cap_vsrc === undefined || !l_videoStreamPool[data.id].cap_label))
	{
		return false;
	}

	if(data.captions && data.cap_vsrc !== undefined)
	{
		l_videoStreamPool[data.id].cap_vsrc = data.cap_vsrc;
		var captions = data.captions;
		l_videoStreamPool[data.id].captions = captions;
	}
	var imFfmpeg = l_videoStreamPool[data.id].imFfmpeg; 
	if(!l_videoStreamPool[data.id].cap_label)
	{
		imFfmpeg.draw_text(data.cap_vsrc, captions[0].text, data.id + "_" + 0, captions[0].args);
		for(var i = 1; i < captions.length; i++)
		{
			imFfmpeg.draw_text(data.id + "_" + (i - 1), captions[i].text, data.id + "_" + i, captions[i].args);
		}
		l_videoStreamPool[data.id].cap_label = data.id + "_" + (captions.length - 1);
	}
	else
		if(data.cap_mdf)
		{
			imFfmpeg.modify_text(data.cap_mdf.text, data.cap_mdf.idx);
		}
	
	return true;
}


///////////////////////////////////////////
// get caption text for a channel
// input: {id: "channel_id"}
//
///////////////////////////////////////////
exports.getCaptionText = function(data)
{
}



////////////////////////////////////
// to run some functions automatically
// input: "start" | "stop" 
// output: true if success | false if not success
////////////////////////////////////
var daemonX = {};
exports.daemon = function (data) {

	if (data === 'start') { 
		daemonX.schedule = setInterval(function(){
				console.log("daemon" + new Date());
				// 自動檢查 錄影 schedule 時間到了 

				// 自動檢查 磁碟空間接近不足 

				// 自動清除 cache 

				}, 5000);
		console.log("IC.Video daemon start ");
	}
	else if (data === 'stop') {
		clearInterval(daemonX.schedule);
		console.log("IC.Video daemon stop ");
	}
	else {
		console.log("{ start | stop }");
	}
}


