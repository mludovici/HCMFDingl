/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([
	"sap/ui/core/UIComponent",
	"sap/ui/core/routing/HashChanger",
	"hcm/fab/lib/common/util/CommonModelManager",
	"sap/ui/Device",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"hcm/fab/myleaverequest/model/models",
	"hcm/fab/myleaverequest/controller/ErrorHandler",
	"hcm/fab/myleaverequest/utils/utils"
], function (UIComponent, HashChanger, CommonModelManager, Device, JSONModel, Filter, FilterOperator, models, ErrorHandler, utils) {
	"use strict";

	/* global Promise */
	return UIComponent.extend("hcm.fab.myleaverequest.Component", {
		metadata: {
			manifest: "json"
		},

		oMessageProcessor: null,
		oMessageManager: null,
		sEmployeeId: undefined,

		/**
		 * The component is initialized by UI5 automatically during the startup of the app and calls the init method once.
		 * In this function, the FLP and device models are set and the router is initialized.
		 * @public
		 * @override
		 */
		init: function () {
			// call the base component's init function
			UIComponent.prototype.init.apply(this, arguments);

			// initialize the message handler
			this.oMessageProcessor = new sap.ui.core.message.ControlMessageProcessor();
			this.oMessageManager = sap.ui.getCore().getMessageManager();

			this.oMessageManager.registerMessageProcessor(this.oMessageProcessor);

			// initialize the error handler with the component
			this._oErrorHandler = new ErrorHandler(this, this.oMessageProcessor, this.oMessageManager);

			// set the device model
			this.setModel(models.createDeviceModel(), "device");

			this.setModel(this.oMessageManager.getMessageModel(), "message");

			// create the views based on the url/hash
			this.getRouter().initialize();

			var oStartupParameters = this.getStartupParameters();
			if (oStartupParameters.action && !this.hasInnerAppRoute()) {
				this.navigateToView(oStartupParameters);
			}

			// Instantiate global app model
			this.setModel(new JSONModel({
				lastLeaveRequestChangeDate: undefined,
				leaveRequestMinDisplayDate: undefined,
				defaultFilterDate: undefined,
				isAssignmentLoading: true,
				isConfigLoading: false,
				sCountryGrouping: null,
				sEmployeeNumber: null,
				showEmployeeNumber: false,
				showEmployeePicture: false,
				bShowEmployeeNumberWithoutZeros: false,
				bEditRequestBeforeDeletion: false,
				bShowBusyIndicatorForFunctionImports: false,
				bShowIndustryHours: true,
				bReloadApproversUponDateChange: false
			}), "global");
		},

		hasInnerAppRoute: function () {
			var oURLParsing = sap.ushell.Container.getService("URLParsing"),
				sHash = HashChanger.prototype.getHash(),
				oParsedURL = oURLParsing.parseShellHash(sHash);

			return typeof oParsedURL.appSpecificRoute === "string" && oParsedURL.appSpecificRoute.length > 0;
		},

		navigateToView: function (oStartupParameters) {
			var oAllowedActionParamValue = {
					"create": "creationWithParams"
				},
				sTargetRoute = oAllowedActionParamValue[oStartupParameters.action];

			if (!sTargetRoute) {
				return;
			}

			this.getRouter().navTo(sTargetRoute, {
				absenceType: oStartupParameters.absenceType || "default",
				dateFrom: oStartupParameters.dateFrom || 0,
				dateTo: oStartupParameters.dateTo || 0
			});
		},

		getStartupParameters: function () {
			if (!this.getComponentData()) {
				return {};
			}
			var oAllStartupParameters = this.getComponentData().startupParameters,
				oStartupParameters = {};

			Object.keys(oAllStartupParameters).forEach(function (sParameter) {
				oStartupParameters[sParameter] = oAllStartupParameters[sParameter][0];
			});

			return oStartupParameters;
		},
		
		/**
		 * The component is destroyed by UI5 automatically.
		 * In this method, the ErrorHandler is destroyed.
		 * @public
		 * @override
		 */
		destroy: function () {
			this.getErrorHandler().destroy();
			// call the base component's destroy function
			UIComponent.prototype.destroy.apply(this, arguments);
		},

		/**
		 * This method can be called to determine whether the sapUiSizeCompact or sapUiSizeCozy
		 * design mode class should be set, which influences the size appearance of some controls.
		 * @public
		 * @return {string} css class, either 'sapUiSizeCompact' or 'sapUiSizeCozy' - or an empty string if no css class should be set
		 */
		getContentDensityClass: function () {
			if (this._sContentDensityClass === undefined) {
				// check whether FLP has already set the content density class; do nothing in this case
				if (jQuery(document.body).hasClass("sapUiSizeCozy") || jQuery(document.body).hasClass("sapUiSizeCompact")) {
					this._sContentDensityClass = "";
				} else if (!Device.support.touch) { // apply "compact" mode if touch is not supported
					this._sContentDensityClass = "sapUiSizeCompact";
				} else {
					// "cozy" in case of touch support; default for most sap.m controls, but needed for desktop-first controls like sap.ui.table.Table
					this._sContentDensityClass = "sapUiSizeCozy";
				}
			}
			return this._sContentDensityClass;
		},

		getErrorHandler: function () {
			return this._oErrorHandler;
		},

		getAssignmentPromise: function (sNewlySelectedAssignment) {
			var oGlobalModel = this.getModel("global"),
				sEmployeeNumber = oGlobalModel.getProperty("/sEmployeeNumber"),
				fnAssignmentChange = function (oAssignment) {
					oGlobalModel.setProperty("/sEmployeeNumber", oAssignment.EmployeeId);
					oGlobalModel.setProperty("/showEmployeeNumber", oAssignment.ShowEmployeeNumber);
					oGlobalModel.setProperty("/showEmployeePicture", oAssignment.ShowEmployeePicture);
					oGlobalModel.setProperty("/bShowEmployeeNumberWithoutZeros", oAssignment.ShowEmployeeNumberWithoutZeros);

					//read ConfigurationSet
					oGlobalModel.setProperty("/isConfigLoading", true);
					return this._readConfigurationSet(oAssignment.EmployeeId).then(function () {
						oGlobalModel.setProperty("/isConfigLoading", false);
						oGlobalModel.setProperty("/isAssignmentLoading", false);
						return oAssignment.EmployeeId;
					}.bind(this));
				}.bind(this),
				oStartupParameters = this.getStartupParameters();

			if (oStartupParameters.OnBehalfEmployeeNumber && oStartupParameters.RequesterNumber) {
				CommonModelManager.setOnBehalfEmployeeId(oStartupParameters.RequesterNumber, oStartupParameters.OnBehalfEmployeeNumber,
					"MYLEAVEREQUESTS");
				// get assignment info for selected Assignment (onBehalf)
				return CommonModelManager.getAssignmentInformation(oStartupParameters.OnBehalfEmployeeNumber, "MYLEAVEREQUESTS").then(
					fnAssignmentChange);
			} else {
				if (sNewlySelectedAssignment) {
					// get assignment info for selected Assignment (CE or onBehalf)
					return CommonModelManager.getAssignmentInformation(sNewlySelectedAssignment, "MYLEAVEREQUESTS").then(fnAssignmentChange);
				}
				if (!sEmployeeNumber) {
					// no assignment known -> retrieve default assignment
					return CommonModelManager.getDefaultAssignment("MYLEAVEREQUESTS").then(fnAssignmentChange);
				}
			}
			return Promise.resolve(sEmployeeNumber);
		},

		_readConfigurationSet: function (sEmployeeId) {
			var _oReadLeaveConfigurationPromise = new Promise(function (resolve, reject) {
				var oGlobalModel = this.getModel("global");

				this.getModel().read("/ConfigurationSet", {
					filters: [new Filter("EmployeeID", FilterOperator.EQ, sEmployeeId)],
					success: function (oResult) {
						var oResultData = oResult.results[0];

						oGlobalModel.setProperty("/defaultFilterDate", oResultData.DefaultFilterDate);
						oGlobalModel.setProperty("/leaveRequestMinDisplayDate", oResultData.MinDisplayDate);

						if (oResultData.hasOwnProperty("CountryGrouping")) {
							oGlobalModel.setProperty("/sCountryGrouping", oResultData.CountryGrouping);
						}
						//Note 2819539: check whether request should be edited upon deletion
						if (oResultData.hasOwnProperty("EditRequestBeforeDeletion")) {
							oGlobalModel.setProperty("/bEditRequestBeforeDeletion", oResultData.EditRequestBeforeDeletion);
						}
						if (oResultData.hasOwnProperty("ShowBusyIndicatorForFunctionImports")) {
							oGlobalModel.setProperty("/bShowBusyIndicatorForFunctionImports", oResultData.ShowBusyIndicatorForFunctionImports);
						}
						//Note 2857768: Enable hour based input in real minutes & hours as alternative to industry minutes
						if (oResultData.hasOwnProperty("ShowDurationIndustrialHours")) {
							oGlobalModel.setProperty("/bShowIndustryHours", oResultData.ShowDurationIndustrialHours);
						}
						//Note xyz: Reload Multi Approver Upon Date Change
						if (oResultData.hasOwnProperty("ReloadApproversUponDateChange")) {
							oGlobalModel.setProperty("/bReloadApproversUponDateChange", oResultData.ReloadApproversUponDateChange);
						}
						resolve();
					}.bind(this),

					error: function (oError) {
						oGlobalModel.setProperty("/leaveRequestMinDisplayDate", utils.dateToLocal(new Date(Date.UTC(new Date().getFullYear(), null,
							1))));
						reject(oError);
					}.bind(this)
				});
			}.bind(this));

			return _oReadLeaveConfigurationPromise;
		}

	});
});