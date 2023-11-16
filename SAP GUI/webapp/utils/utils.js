/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([],function(){"use strict";function a(){var r;var R;var p=new Promise(function(c,g){r=c.bind(null);R=g.bind(null);});return{resolve:r,reject:R,promise:p};}function n(){var c=this;var r=sap.ui.core.UIComponent.getRouterFor(c);var A=arguments;jQuery.sap.delayedCall(0,this,function(){r.navTo.apply(r,A);});}function d(D){if(!D){return undefined;}return new Date(Date.UTC(D.getFullYear(),D.getMonth(),D.getDate()));}function b(D){if(!D){return undefined;}var _=new Date(D.getTime());_.setMinutes(_.getMinutes()+D.getTimezoneOffset());return _;}function e(x){var D={},c,g,A=function(h,v){if(D[h]){if(D[h].constructor!==Array){D[h]=[D[h]];}D[h][D[h].length]=v;}else{D[h]=v;}};for(c=0;c<x.attributes.length;c++){g=x.attributes[c];A(g.name,g.value);}for(c=0;c<x.childNodes.length;c++){g=x.childNodes[c];if(g.nodeType===1){if(g.childNodes.length===1&&g.firstChild.nodeType===3){A(g.nodeName,g.firstChild.nodeValue);}else{A(g.nodeName,e(g));}}}return D;}function f(E){return decodeURIComponent(E);}function s(D){if(D){if(D.getMetadata().hasProperty("resizable")){D.setResizable(true);}if(D.getMetadata().hasProperty("draggable")){D.setDraggable(true);}}return D;}return{createDeferred:a,navTo:n,dateToUTC:d,dateToLocal:b,convertXML2JSON:e,decodeURLComponent:f,setResizableDraggableForDialog:s};});
