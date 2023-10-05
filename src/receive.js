///////////////////////////////////////////////////////////////////////////
// receive.js
//
// socketcan input node.
//
// This file is part of the VSCP (https://www.vscp.org)
//
// The MIT License (MIT)
//
// Copyright © 2020-2022 Ake Hedman, Grodans Paradis AB
// <info@grodansparadis.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//

module.exports = function (RED) {

	"use strict";

	// Debug:
	// https://nodejs.org/api/util.html
	// export NODE_DEBUG=socketcan-out  for all debug events
	const util = require('util');
	const debuglog = util.debuglog('socketcan-out');

	var can = require('socketcan');

	function SocketcanReceiveNode(config) {

		RED.nodes.createNode(this, config);

		this.config = RED.nodes.getNode(config.config);

		if (this.config) {
			this.interface = this.config.interface;
		}
		else {
			return;	// Do nothing
			//this.interface="vcan0";
		}

		debuglog("CAN interface = " + this.interface);

		var node = this;
		// Access the flow context object
		const flowContext = this.context().flow;


		// Tell the world that we are connecting to the interface
		//this.status({fill:"yellow",shape:"dot",text: "connecting... " + "<" + this.interface + ">"});
		this.status({ fill: "yellow", shape: "dot", text: "Waiting for a KCD file... " + "<" + this.interface + ">" });

		var channel;
		var network;
		var databaseService;

		var started = false;

		// if (sock && network) {




		// 	// Tell the world we are on
		// 	//this.status({fill:"green",shape:"dot",text:"connected " + "<" + this.interface + ">" });


		// 	db_u52.messages["Enginestat_4E0"].signals["OilTemp"].onChange(function (s) {
		// 		console.log("Temp " + s.value);
		// 		var msg = {};
		// 		msg.payload = {};
		// 		msg.payload = JSON.stringify(s);
		// 		node.send([{ payload: network }, { payload: "huy" }]);
		// 	});


		// Add a message listener
		// sock.addListener("onMessage",function(frame) {
		// 	debuglog("CAN message :",frame);
		// 	var msg={};
		// 	msg.payload = {};
		// 	msg.payload.timestamp = frame.timestamp || new Date().getTime();
		// 	msg.payload.ext       = frame.ext || false;
		// 	msg.payload.canid     = frame.id; 
		// 	msg.payload.dlc       = frame.data.length;
		// 	msg.payload.rtr       = frame.rtr || false;
		// 	msg.payload.data = [];
		// 	//msg.payload.data.push(frame.data);

		// 	msg.payload.data =  Array.prototype.slice.call(frame.data, 0);
		// 	node.send(msg);
		// });
		this.on("input", function (msg) {
			if (!started) {
				try {
					// Create raw interface with timestamp
					channel = can.createRawChannel("" + this.interface, {
						timestamps: true
					});

					network = can.parseNetworkDescription(msg.payload.kcdPath);
					const networkBusNames = Object.keys(network.buses);
					databaseService = new can.DatabaseService(channel, network.buses[networkBusNames[0]]);

					const tabulatorFormattedData = [];
					var tabulatorRowId = 0;

					// Iterate through each message
					network.buses[networkBusNames[0]].messages.forEach((m) => {
						m.signals.forEach((s) => {

							tabulatorFormattedData.push({
								"id": tabulatorRowId,
								"frame_name": m.name,
								"signal_name": s.name,
								"value": "" // Leave it empty as requested
							});

							(function (rowId, frameName, signalName) {
								databaseService.messages[m.name].signals[s.name].onChange(function (s) {
									var tabulatorData = {
										"id": rowId, // Access the captured rowId
										"value": s.unit !== undefined
											? Math.round(s.value) + (s.unit ? " " + s.unit : "")
											: Math.round(s.value)
									};

									var signalData = {
										"id": frameName + "." + signalName,
										"value": s.value
									};

									node.send([null, { payload: tabulatorData }, { signalName: frameName + "." + signalName, payload: s.value }]);
								});
							})(tabulatorRowId, m.name, s.name); // Pass tabulatorRowId to the IIFE

							tabulatorRowId++;
						});
					});

					
					flowContext.set("canTableData", tabulatorFormattedData);
					node.send([{ payload: tabulatorFormattedData }, null, null]);

					channel.start();

					this.status({ fill: "green", shape: "dot", text: "connected " + "<" + this.interface + ">" });
					started = true;

				} catch (err) {
					// Did not handle this interface
					node.error("Error: " + err.message + this.interface);
					this.status({ fill: "red", shape: "dot", text: err.message + "<" + this.interface + ">" });
				}

				// Send the processed message to the next node
				// node.send(msg);
			}
		});

		///////////////////////////////////////////////////////////////////
		//                          on close	
		///////////////////////////////////////////////////////////////////
		this.on("close", function (removed, done) {

			channel.stop();

			// Tell the worl we had gone down
			this.status({ fill: "red", shape: "dot", text: "disconnected." });

			if (removed) {
				// This node has been deleted
			} else {
				// This node is being restarted
			}

			done();
		});

	}
	RED.nodes.registerType("socketcan-out", SocketcanReceiveNode);
}
