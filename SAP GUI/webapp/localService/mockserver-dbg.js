/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([
	"sap/ui/core/util/MockServer",
	"hcm/fab/lib/common/util/MockServerUtil",
	"sap/ui/unified/FileUploader",
	"sap/m/UploadCollection"
], function(MockServer, MockServerUtil, FileUploader, UploadCollection) {
	"use strict";
	var oMockServer,
		_sAppModulePath = "hcm/fab/myleaverequest/",
		_sJsonFilesModulePath = _sAppModulePath + "localService/mockdata";

	return {

		/**
		 * Initializes the mock server.
		 * You can configure the delay with the URL parameter "serverDelay".
		 * The local mock data in this folder is returned instead of the real data for testing.
		 * @public
		 */
		init: function() {
			var oUriParameters = jQuery.sap.getUriParameters(),
				sJsonFilesUrl = jQuery.sap.getModulePath(_sJsonFilesModulePath),
				sManifestUrl = jQuery.sap.getModulePath(_sAppModulePath + "manifest", ".json"),
				sErrorParam = oUriParameters.get("errorType"),
				oManifest = jQuery.sap.syncGetJSON(sManifestUrl).data,
				oMainDataSource = oManifest["sap.app"].dataSources.leaveService,
				sMetadataUrl = jQuery.sap.getModulePath(_sAppModulePath + oMainDataSource.settings.localUri.replace(".xml", ""), ".xml"),
				// ensure there is a trailing slash
				sMockServerUrl = /.*\/$/.test(oMainDataSource.uri) ? oMainDataSource.uri : oMainDataSource.uri + "/";

			oMockServer = new MockServer({
				rootUri: sMockServerUrl
			});

			// configure mock server with a delay of 1s
			MockServer.config({
				autoRespond: true,
				autoRespondAfter: (oUriParameters.get("serverDelay") || 10)
			});

			// load local mock data
			oMockServer.simulate(sMetadataUrl, {
				sMockdataBaseUrl: sJsonFilesUrl,
				bGenerateMissingMockData: true
			});

			// initialize library mock server
			MockServerUtil.startCommonLibraryMockServer();

			var aRequests = oMockServer.getRequests(),
				fnResponse = function(iErrCode, sMessage, aRequest) {
					aRequest.response = function(oXhr) {
						oXhr.respond(iErrCode, {
							"Content-Type": "text/plain;charset=utf-8"
						}, sMessage);
					};
				};

			// handling the metadata error test
			if (oUriParameters.get("metadataError")) {
				aRequests.forEach(function(aEntry) {
					if (aEntry.path.toString().indexOf("$metadata") > -1) {
						fnResponse(500, "metadata Error", aEntry);
					}
				});
			}

			aRequests.push({
				method: "GET",
				path: new RegExp("CalculateQuotaAvailable(.*)"),
				response: function(oXhr, sUrlParams) {
					var sReponseFile = jQuery.sap.getResourcePath("hcm/fab/myleaverequest/localService/mockdata/CalculateQuotaAvailable.json");
					oXhr.respondFile(200, null, sReponseFile);
				}
			});

			aRequests.push({
				method: "GET",
				path: new RegExp("CalculateLeaveSpan(.*)"),
				response: function(oXhr, sUrlParams) {
					var sReponseFile = jQuery.sap.getResourcePath("hcm/fab/myleaverequest/localService/mockdata/CalculateLeaveSpan.json");
					oXhr.respondFile(200, null, sReponseFile);
				}
			});

			/*aRequests.push({
			    method: "GET",
			    path: new RegExp("TimeAccountSet(.*)"), 
			    response: function(oXhr, sUrlParams) {
			    var sfilterModified = sUrlParams.replace("FilterStartDate", "DeductionStartDate");
			    sfilterModified = sfilterModified.replace("?", "");
			    sfilterModified = "/webapp/localService/mockdata/TimeAccountSet.json?" + sfilterModified.substring(1);
			    var oResponse = jQuery.sap.sjax({
			       	url: sfilterModified
				});           	
				oXhr.respondJSON(200, null, JSON.stringify(oResponse.data));
			    }
			});*/

			// Attachment handling
			// Intercept attachment upload from upload collection to prevent access to any local files (not works in IE?)
			var _fnSendFiles = FileUploader.prototype.sendFiles;
			FileUploader.prototype.sendFiles = function(aXhr, iIndex) {
				if (aXhr[iIndex]) {
					aXhr[iIndex].file = {};
				}
				_fnSendFiles.call(this, aXhr, iIndex);
			};
			// This is a copy of the upload implementation in UI5 1.44.44
			if(sap.ui.getCore().getConfiguration().getVersion().getMinor() === 44) {
				FileUploader.prototype.upload = function() {
					//supress Upload if the FileUploader is not enabled
					if (!this.getEnabled()) {
						return;
					}
					var uploadForm = this.getDomRef("fu_form");
					var iFiles, sHeader, sValue, oXhrEntry;
					try {
						this._bUploading = true;
						if (this.getSendXHR() && window.File) {
							/** modified */
							var aFiles = this.__files || this.FUEl.files;
							/** modified */
							if (aFiles.length > 0) {
								if (this.getUseMultipart()) {
									//one xhr request for all files
									iFiles = 1;
								} else {
									//several xhr requests for every file
									iFiles = aFiles.length;
								}
								// Save references to already uploading files if a new upload comes between upload and complete or abort
								this._aXhr = this._aXhr || [];
								for (var j = 0; j < iFiles; j++) {
									//keep a reference on the current upload xhr
									this._uploadXHR = new window.XMLHttpRequest();
									oXhrEntry = {
										xhr: this._uploadXHR,
										requestHeaders: []
									};
									this._aXhr.push(oXhrEntry);
									oXhrEntry.xhr.open("POST", this.getUploadUrl(), true);
									if (this.getHeaderParameters()) {
										var aHeaderParams = this.getHeaderParameters();
										for (var i = 0; i < aHeaderParams.length; i++) {
											sHeader = aHeaderParams[i].getName();
											sValue = aHeaderParams[i].getValue();
											oXhrEntry.requestHeaders.push({
												name: sHeader,
												value: sValue
											});
										}
									}
									var sFilename = aFiles[j].name;
									var aRequestHeaders = oXhrEntry.requestHeaders;
									oXhrEntry.fileName = sFilename;
									oXhrEntry.file = aFiles[j];
									this.fireUploadStart({
										"fileName": sFilename,
										"requestHeaders": aRequestHeaders
									});
									for (var k = 0; k < aRequestHeaders.length; k++) {
										// Check if request is still open in case abort() was called.
										if (oXhrEntry.xhr.readyState === 0) {
											break;
										}
										sHeader = aRequestHeaders[k].name;
										sValue = aRequestHeaders[k].value;
										oXhrEntry.xhr.setRequestHeader(sHeader, sValue);
									}
								}
								if (this.getUseMultipart()) {
									var formData = new window.FormData();
									var name = this.FUEl.name;
									for (var l = 0; l < aFiles.length; l++) {
										formData.append(name, aFiles[l]);
									}
									formData.append("_charset_", "UTF-8");
									var data = this.FUDataEl.name;
									if (this.getAdditionalData()) {
										var sData = this.getAdditionalData();
										formData.append(data, sData);
									} else {
										formData.append(data, "");
									}
									if (this.getParameters()) {
										var oParams = this.getParameters();
										for (var m = 0; m < oParams.length; m++) {
											var sName = oParams[m].getName();
											sValue = oParams[m].getValue();
											formData.append(sName, sValue);
										}
									}
									oXhrEntry.file = formData;
									this.sendFiles(this._aXhr, 0);
								} else {
									this.sendFiles(this._aXhr, 0);
								}
								this._bUploading = false;
								this._resetValueAfterUploadStart();
							}
						} else if (uploadForm) {
							uploadForm.submit();
							this._resetValueAfterUploadStart();
						}
					} catch (oException) {
						this._bUploading = true;
					}
				};
			}
			var _onChange = UploadCollection.prototype._onChange;
			UploadCollection.prototype._onChange = function(event) {
				var _event = event;
				if (!event.getParameter("files")) { // upload was not done by a user with the select-file-dialog
					_event = jQuery.extend({}, event, {
						mParameters: {
							files: event.getSource().__files
						}
					}, true);
					//					event.mParameters.files = event.getSource().__files;
				}
				_onChange.call(this, _event);
			};

			// 2) Properly handle create request on toAttachments navigation property
			aRequests.push({
				method: "POST",
				path: new RegExp("LeaveRequestSet\((.+)\).*toAttachments"),
				response: function(oXhr, sUrlParams) {
					// find corresponding leave request
					var sAttachmentName = oXhr.requestHeaders.slug;
					var sKey = oXhr.url.replace("/toAttachments", "");
					var aMatch = new RegExp("RequestID='([\\w%]+)'").exec(sKey);
					var sRequestId = decodeURIComponent(aMatch[1]);

					var bUpdate = false;
					var aLeaveRequestList = oMockServer.getEntitySetData("LeaveRequestSet");
					for (var a = 0; a < aLeaveRequestList.length; a++) {
						var oLeaveRequest = aLeaveRequestList[a];
						if (oLeaveRequest.__metadata.uri === sKey) {
							// if we find the attachment -> make it permanent
							for (var i = 1; i <= 5; i++) {
								var oAttachment = oLeaveRequest["Attachment" + i];
								if (oAttachment) {
									if (oAttachment.FileName == sAttachmentName) {
										oAttachment.AttachmentStatus = "E";
										oAttachment.LeaveRequestId = sRequestId;
										bUpdate = true;
										break;
									}
								} else { // first empty attachment slot
									oLeaveRequest["Attachment" + i] = {
										LeaveRequestId: sRequestId,
										FileName: sAttachmentName
									};
									bUpdate = true;
									break;
								}
							}
							break;
						}
					}
					if (bUpdate) {
						oMockServer.setEntitySetData("LeaveRequestSet", aLeaveRequestList);
					}
					oXhr.respond(201);
					return true;
				}
			});

			// 3) Handling for leave request merge special cases
			for (var i = 0; i < aRequests.length; i++) {
				var oRequest = aRequests[i];
				if (oRequest.method === "MERGE" && oRequest.path.toString().startsWith("/(LeaveRequestSet)")) {
					var fnOriginal = oRequest.response;
					oRequest.response = function(oXhr) {
						var sNewRequestID = undefined;
						// old UI5 versions send a wrong Content-Type header
						//						if(oXhr.requestHeaders["Content-Type"].startsWith("application/json")) {
						var oLeaveRequest = JSON.parse(oXhr.requestBody);
						var bUpdateRequestBody = false;

						// check for deleted attachments
						for (var i = 1; i <= 5; i++) {
							var oAttachment = oLeaveRequest["Attachment" + i];
							if (oAttachment && oAttachment.AttachmentStatus === "D") {
								// move subsequent attachments one slot up
								for (var j = i; j <= 5; j++) {
									var oNextAttachment = oLeaveRequest["Attachment" + (j + 1)];
									if (oNextAttachment) { // we have a slot we can move up
										oLeaveRequest["Attachment" + j] = oNextAttachment;
									} else { // fill with empty
										oLeaveRequest["Attachment" + j] = {
											FileName: ""
										};
									}
								}
								bUpdateRequestBody = true;
							}
						}

						// check for changes to posted leave request (requires all leave request properties)
						var sKey = oXhr.url;
						var aLeaveRequestList = oMockServer.getEntitySetData("LeaveRequestSet");
						for (var a = 0; a < aLeaveRequestList.length; a++) {
							var oLeaveRequestFull = aLeaveRequestList[a];
							if (oLeaveRequestFull.__metadata.uri === sKey) {
								if (oLeaveRequestFull.StatusID === "POSTED") {
									// create a new leave request in status sent with a different request id
									var oNewLeaveRequest = jQuery.extend({}, oLeaveRequestFull, oLeaveRequest, true);
									oNewLeaveRequest.StatusID = "SENT";
									oNewLeaveRequest.StatusTxt = "Sent";
									oNewLeaveRequest.RequestID = ("00000000000000000000000000000000" + oLeaveRequestFull.RequestID).slice(-32);
									oNewLeaveRequest.RequestID = "FFFF" + oNewLeaveRequest.RequestID.slice(4);
									oNewLeaveRequest.__metadata.uri = oNewLeaveRequest.__metadata.uri.replace(oLeaveRequestFull.RequestID, oNewLeaveRequest.RequestID);
									aLeaveRequestList.splice(a + 1, 0, oNewLeaveRequest); // insert after original entry
									oMockServer.setEntitySetData("LeaveRequestSet", aLeaveRequestList);

									// original posted leave request is not longer changeable
									for (var k = 1; k <= 5; k++) { // clear attachment slots, they are only created on the SENT request
										oLeaveRequest["Attachment" + k] = {
											FileName: ""
										};
									}
									oLeaveRequest.IsDeletable = false;
									oLeaveRequest.IsModifiable = false;
									bUpdateRequestBody = true;

									// remember new request id to set later
									sNewRequestID = oNewLeaveRequest.RequestID;
								}
								break;
							}
						}

						// write update back to request
						if (bUpdateRequestBody) {
							oXhr.requestBody = JSON.stringify(oLeaveRequest);
						}
						//						}

						// posted leave changed? set requestid header field (in default response handling)
						if (sNewRequestID) {
							var fnSetResponseHeaders = oXhr.setResponseHeaders;
							oXhr.setResponseHeaders = function(oHeaders) {
								fnSetResponseHeaders.call(this, jQuery.extend({
									requestid: sNewRequestID
								}, oHeaders));
							};
						}

						// call standard mock server for response generation
						var result = fnOriginal.apply(this, arguments);

						return result;
					};
					break;
				}
			}

			oMockServer.attachBefore("POST", function(oEvent) {
				var oXhr = oEvent.getParameter("oXhr");
				if (oXhr.requestHeaders["Content-Type"].startsWith("application/json")) {
					var oLeaveRequest = JSON.parse(oXhr.requestBody);
					var bUpdateRequestBody = false;

					// create attachments slots (so that all 5 are present)
					for (var i = 1; i <= 5; i++) {
						if (!oLeaveRequest["Attachment" + i]) {
							oLeaveRequest["Attachment" + i] = {
								FileName: ""
							};
							bUpdateRequestBody = true;
						}
					}

					// write update back to request
					if (bUpdateRequestBody) {
						oXhr.requestBody = JSON.stringify(oLeaveRequest);
					}
				}
			}, "LeaveRequestSet");

			// Handling request errors
			if (sErrorParam) {
				aRequests.forEach(function(aEntry) {});
			}

			oMockServer.setRequests(aRequests);

			// var adjustNavProperties = function(oEvent) {
			// 	var aResults = oEvent.getParameter("oFilteredData").results;
			// 	var oXHR = oEvent.getParameter("oXhr");

			// 	if (oXHR.url.indexOf("toAdditionalFieldsDefinition") > -1) {
			// 		aResults.forEach(function(aResult, indexFieldResults) {
			// 			var iFieldDefLength = aResult.toAdditionalFieldsDefinition.results.length;
			// 			//The mockserver provides navigation properties different to the ODATA request (in case of no keys defined)
			// 			//So we need to process some additional logic to arrange additional fields according to the format 
			// 			//similar to the ODATA request
			// 			for (var i = 0; iFieldDefLength; i++) {
			// 				// Replace the summarization (object) array with the specific array of for the related absence type
			// 				// That means all additional field definition (of all available absence types) will be replaced 
			// 				// by only one which belongs to the absence type
			// 				if (indexFieldResults == i) {
			// 					aResult.toAdditionalFieldsDefinition.results = aResult.toAdditionalFieldsDefinition.results[i];
			// 					break;
			// 				}
			// 			}
			// 		});
			// 	}
			// };

			/*var adjustFilterProperties = function(oEvent) {
			      var aResults = oEvent.getParameter("oFilteredData").results;
			      var oXHR = oEvent.getParameter("oXhr");
			      
			      if (oXHR.url.indexOf("filter=FilterStartDate") > -1){
    			    aResults.forEach( function ( aResult, indexFieldResults) {
                        var iFieldDefLength = aResult.toAdditionalFieldsDefinition.results.length;
                        for (var i = 0; iFieldDefLength; i ++){
                            if (indexFieldResults == i){
                                aResult.toAdditionalFieldsDefinition.results = aResult.toAdditionalFieldsDefinition.results[i].results;
                                break;
                            }
                        }                           
                    });
			      }	
                };*/

			/*var adjustFilterProperties = function(oEvent){
			    	//var table = this.getView().byId("entitlementTable");
			    	 var aResults = oEvent.getParameter("oFilteredData").results;
			};*/

			// oMockServer.attachAfter("GET", adjustNavProperties, "AbsenceTypeSet");
			//oMockServer.attachAfter("GET", adjustFilterProperties, "TimeAccountSet");    
			oMockServer.start();

			jQuery.sap.log.info("Running the app with mock data");
		},

		/**
		 * @public returns the mockserver of the app, should be used in integration tests
		 * @returns {sap.ui.core.util.MockServer} the mockserver instance
		 */
		getMockServer: function() {
			return oMockServer;
		}
	};

});