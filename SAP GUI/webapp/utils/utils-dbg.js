/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([

], function () {
	"use strict";

	/* global Promise */

	/*
	 * Returns a new Deferred object. new jQuery.Deferred() can be used
	 * instead, however this returns a more standard ES6 Promise object
	 * instead of jQuery promises.
	 */
	function createDeferred() {
		var fnResolveDeferred;
		var fnRejectDeferred;

		var oPromise = new Promise(function (fnResolve, fnReject) {
			fnResolveDeferred = fnResolve.bind(null);
			fnRejectDeferred = fnReject.bind(null);
		});

		return {
			resolve: fnResolveDeferred,
			reject: fnRejectDeferred,
			promise: oPromise
		};
	}

	/**
	 * A wrapper around sap.ui.core.routing.Router#navTo.
	 *
	 * Behaves exactly like navTo, but the navTo is executed
	 * asynchronously. This ensures that all pending code
	 * changes before the navigation are processed.
	 *
	 * IMPORTANT, call this method from a controller and make
	 * sure to pass the controller as the context.
	 */
	function navTo( /* sTarget, oArgs, bReplace */ ) {
		/* eslint-disable */
		var oController = this; // important!
		/* eslint-enable */

		var oRouter = sap.ui.core.UIComponent.getRouterFor(oController);
		var oArgs = arguments;

		jQuery.sap.delayedCall(0, this, function () {
			oRouter.navTo.apply(oRouter, oArgs);
		});
	}

	/**
	 * Transforms a date into UTC (locale independent) format.
	 *
	 * @param {Date} [oDate]
	 *   A Javascript Date object in locale time.
	 *
	 * @returns {Date}
	 *   A Javascript Date in UTC format, or undefined if nothing or another
	 *   falsy value is provided.
	 */
	function dateToUTC(oDate) {
		if (!oDate) {
			return undefined;
		}
		return new Date(Date.UTC(oDate.getFullYear(), oDate.getMonth(), oDate.getDate()));
	}

	function dateToLocal(oDate) {
		if (!oDate) {
			return undefined;
		}
		var _oDate = new Date(oDate.getTime());
		_oDate.setMinutes(_oDate.getMinutes() + oDate.getTimezoneOffset());
		return _oDate;
	}

	function convertXML2JSON(oXml) {
		var oData = {},
			// element attributes
			c, cn,
			// append a value
			fnAdd = function (name, value) {
				if (oData[name]) {
					if (oData[name].constructor !== Array) {
						oData[name] = [oData[name]];
					}
					oData[name][oData[name].length] = value;
				} else {
					oData[name] = value;
				}
			};

		for (c = 0; c < oXml.attributes.length; c++) {
			cn = oXml.attributes[c];
			fnAdd(cn.name, cn.value);
		}
		// child elements
		for (c = 0; c < oXml.childNodes.length; c++) {
			cn = oXml.childNodes[c];
			if (cn.nodeType === 1) {
				if (cn.childNodes.length === 1 && cn.firstChild.nodeType === 3) {
					// text value
					fnAdd(cn.nodeName, cn.firstChild.nodeValue);
				} else {
					// sub-object
					fnAdd(cn.nodeName, convertXML2JSON(cn));
				}
			}
		}
		return oData;
	}

	function decodeURLComponent(sEncodedString) {
		return decodeURIComponent(sEncodedString);
	}

	function setResizableDraggableForDialog(oDialog) {
		if (oDialog) {
			if (oDialog.getMetadata().hasProperty("resizable")) {
				oDialog.setResizable(true);
			}
			if (oDialog.getMetadata().hasProperty("draggable")) {
				oDialog.setDraggable(true);
			}
		}
		return oDialog;

	}

	return {
		createDeferred: createDeferred,
		navTo: navTo,
		dateToUTC: dateToUTC,
		dateToLocal: dateToLocal,
		convertXML2JSON: convertXML2JSON,
		decodeURLComponent: decodeURLComponent,
		setResizableDraggableForDialog: setResizableDraggableForDialog
	};

});