/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define(["sap/ui/core/util/MockServer","hcm/fab/lib/common/util/MockServerUtil","sap/ui/unified/FileUploader","sap/m/UploadCollection"],function(M,b,F,U){"use strict";var o,_="hcm/fab/myleaverequest/",c=_+"localService/mockdata";return{init:function(){var u=jQuery.sap.getUriParameters(),J=jQuery.sap.getModulePath(c),s=jQuery.sap.getModulePath(_+"manifest",".json"),e=u.get("errorType"),d=jQuery.sap.syncGetJSON(s).data,f=d["sap.app"].dataSources.leaveService,g=jQuery.sap.getModulePath(_+f.settings.localUri.replace(".xml",""),".xml"),h=/.*\/$/.test(f.uri)?f.uri:f.uri+"/";o=new M({rootUri:h});M.config({autoRespond:true,autoRespondAfter:(u.get("serverDelay")||10)});o.simulate(g,{sMockdataBaseUrl:J,bGenerateMissingMockData:true});b.startCommonLibraryMockServer();var r=o.getRequests(),R=function(E,m,a){a.response=function(x){x.respond(E,{"Content-Type":"text/plain;charset=utf-8"},m);};};if(u.get("metadataError")){r.forEach(function(E){if(E.path.toString().indexOf("$metadata")>-1){R(500,"metadata Error",E);}});}r.push({method:"GET",path:new RegExp("CalculateQuotaAvailable(.*)"),response:function(x,a){var j=jQuery.sap.getResourcePath("hcm/fab/myleaverequest/localService/mockdata/CalculateQuotaAvailable.json");x.respondFile(200,null,j);}});r.push({method:"GET",path:new RegExp("CalculateLeaveSpan(.*)"),response:function(x,a){var j=jQuery.sap.getResourcePath("hcm/fab/myleaverequest/localService/mockdata/CalculateLeaveSpan.json");x.respondFile(200,null,j);}});var n=F.prototype.sendFiles;F.prototype.sendFiles=function(x,I){if(x[I]){x[I].file={};}n.call(this,x,I);};if(sap.ui.getCore().getConfiguration().getVersion().getMinor()===44){F.prototype.upload=function(){if(!this.getEnabled()){return;}var a=this.getDomRef("fu_form");var t,H,v,x;try{this._bUploading=true;if(this.getSendXHR()&&window.File){var w=this.__files||this.FUEl.files;if(w.length>0){if(this.getUseMultipart()){t=1;}else{t=w.length;}this._aXhr=this._aXhr||[];for(var j=0;j<t;j++){this._uploadXHR=new window.XMLHttpRequest();x={xhr:this._uploadXHR,requestHeaders:[]};this._aXhr.push(x);x.xhr.open("POST",this.getUploadUrl(),true);if(this.getHeaderParameters()){var y=this.getHeaderParameters();for(var i=0;i<y.length;i++){H=y[i].getName();v=y[i].getValue();x.requestHeaders.push({name:H,value:v});}}var z=w[j].name;var A=x.requestHeaders;x.fileName=z;x.file=w[j];this.fireUploadStart({"fileName":z,"requestHeaders":A});for(var k=0;k<A.length;k++){if(x.xhr.readyState===0){break;}H=A[k].name;v=A[k].value;x.xhr.setRequestHeader(H,v);}}if(this.getUseMultipart()){var B=new window.FormData();var C=this.FUEl.name;for(var l=0;l<w.length;l++){B.append(C,w[l]);}B.append("_charset_","UTF-8");var D=this.FUDataEl.name;if(this.getAdditionalData()){var E=this.getAdditionalData();B.append(D,E);}else{B.append(D,"");}if(this.getParameters()){var P=this.getParameters();for(var m=0;m<P.length;m++){var N=P[m].getName();v=P[m].getValue();B.append(N,v);}}x.file=B;this.sendFiles(this._aXhr,0);}else{this.sendFiles(this._aXhr,0);}this._bUploading=false;this._resetValueAfterUploadStart();}}else if(a){a.submit();this._resetValueAfterUploadStart();}}catch(G){this._bUploading=true;}};}var p=U.prototype._onChange;U.prototype._onChange=function(a){var j=a;if(!a.getParameter("files")){j=jQuery.extend({},a,{mParameters:{files:a.getSource().__files}},true);}p.call(this,j);};r.push({method:"POST",path:new RegExp("LeaveRequestSet\((.+)\).*toAttachments"),response:function(x,j){var A=x.requestHeaders.slug;var k=x.url.replace("/toAttachments","");var m=new RegExp("RequestID='([\\w%]+)'").exec(k);var l=decodeURIComponent(m[1]);var t=false;var L=o.getEntitySetData("LeaveRequestSet");for(var a=0;a<L.length;a++){var v=L[a];if(v.__metadata.uri===k){for(var i=1;i<=5;i++){var w=v["Attachment"+i];if(w){if(w.FileName==A){w.AttachmentStatus="E";w.LeaveRequestId=l;t=true;break;}}else{v["Attachment"+i]={LeaveRequestId:l,FileName:A};t=true;break;}}break;}}if(t){o.setEntitySetData("LeaveRequestSet",L);}x.respond(201);return true;}});for(var i=0;i<r.length;i++){var q=r[i];if(q.method==="MERGE"&&q.path.toString().startsWith("/(LeaveRequestSet)")){var O=q.response;q.response=function(x){var N=undefined;var l=JSON.parse(x.requestBody);var m=false;for(var i=1;i<=5;i++){var A=l["Attachment"+i];if(A&&A.AttachmentStatus==="D"){for(var j=i;j<=5;j++){var t=l["Attachment"+(j+1)];if(t){l["Attachment"+j]=t;}else{l["Attachment"+j]={FileName:""};}}m=true;}}var K=x.url;var L=o.getEntitySetData("LeaveRequestSet");for(var a=0;a<L.length;a++){var v=L[a];if(v.__metadata.uri===K){if(v.StatusID==="POSTED"){var w=jQuery.extend({},v,l,true);w.StatusID="SENT";w.StatusTxt="Sent";w.RequestID=("00000000000000000000000000000000"+v.RequestID).slice(-32);w.RequestID="FFFF"+w.RequestID.slice(4);w.__metadata.uri=w.__metadata.uri.replace(v.RequestID,w.RequestID);L.splice(a+1,0,w);o.setEntitySetData("LeaveRequestSet",L);for(var k=1;k<=5;k++){l["Attachment"+k]={FileName:""};}l.IsDeletable=false;l.IsModifiable=false;m=true;N=w.RequestID;}break;}}if(m){x.requestBody=JSON.stringify(l);}if(N){var S=x.setResponseHeaders;x.setResponseHeaders=function(H){S.call(this,jQuery.extend({requestid:N},H));};}var y=O.apply(this,arguments);return y;};break;}}o.attachBefore("POST",function(E){var x=E.getParameter("oXhr");if(x.requestHeaders["Content-Type"].startsWith("application/json")){var l=JSON.parse(x.requestBody);var a=false;for(var i=1;i<=5;i++){if(!l["Attachment"+i]){l["Attachment"+i]={FileName:""};a=true;}}if(a){x.requestBody=JSON.stringify(l);}}},"LeaveRequestSet");if(e){r.forEach(function(E){});}o.setRequests(r);o.start();jQuery.sap.log.info("Running the app with mock data");},getMockServer:function(){return o;}};});