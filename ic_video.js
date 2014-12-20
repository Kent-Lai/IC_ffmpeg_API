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
cacheAddress = "web/"; 
videoStorageAddress = "video/";
IC.DB.useCollections(["videoChannels"]);

//-----------------------------------------
// define local variables
//
//-----------------------------------------

// reference to video object
var l_videoStreamPool = {};

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
	IC.DB.updateData('videoChannels', {id: data.id}, data, 
			function (){
			console.log("db setdata success");
			}, 
			function () {
			console.log("db setdata not success");
			}); 
}

var l_partiallyUpdateData = function (origin, update) {
	if (Object.keys(update).length > 0) {
		for (var key in update) {
			if (update[key] || update[key] === '' || update[key] === 0) {
				origin[key] = update[key];
			};
		};
	};
};



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
			l_partiallyUpdateDate(l_videoStreamPool[data.id], data);
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
exports.getChannel = function (data) {
	console.log("l_videoStreamPool: %j", l_videoStreamPool);
	console.log("in exports.getChannel");
	IC.DB.getArray('videoChannels',  
			function (data) {
			console.log("data restoring: %j", data);
			for (var i in data) { 
			console.log(i);
			console.log(data[i].in);
			console.log(data[i].id);
			l_videoStreamPool[data[i].id] = data[i];
			}

			if (data.id && typeof data.id === 'string' ) {
			//if (l_videoStreamPool[data.id]) 
			return l_videoStreamPool[data.id];
			//else return false;
			} 
			else {
			return l_videoStreamPool;
			}
			}, 
			function (data) {
			console.log("fail = data restoring");
			console.log(data);
			return false;
			});
}


///////////////////////////////////////
// delete a single channel 
// input: {id: "channel_id"} 
// output: true if success | false if not success
///////////////////////////////////////
exports.deleteChannel = function (data) {

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
		if ( l_videoStreamPool[key].process ) 
			active.push(l_videoStreamPool[key].id);
		else 
			inactive.push(l_videoStreamPool[key].id);
	}
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

	if(l_videoStreamPool[data.id].status === "on")
	{
		LOG.warn("id: " + data.id + " is recording");
		return false;
	}

	var imFfmpeg = create_imFfmpeg();
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

	imFfmpeg.create_multiple_outputs(0, dup_outputs);

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

	l_videoStreamPool[data.id].imFfmpeg = imFfmpeg;
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
	if(l_videoStreamPool[data.id].status === "on")
	{
		l_videoStreamPool[data.id].status = "off";
		l_videoStreamPool[data.id].imFfmpeg.kill();
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
exports.setCaptionText = function(data)
{
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


