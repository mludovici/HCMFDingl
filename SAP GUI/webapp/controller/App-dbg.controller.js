/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([
	"hcm/fab/myleaverequest/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"hcm/fab/lib/common/util/CommonModelManager"
], function (BaseController, JSONModel, CommonModelManager) {
	"use strict";

	return BaseController.extend("hcm.fab.myleaverequest.controller.App", {

		onInit: function () {
			var oViewModel,
				fnSetAppNotBusy,
				iOriginalBusyDelay = this.getView().getBusyIndicatorDelay();

			oViewModel = new JSONModel({
				busy: true,
				delay: 0
			});
			this.setModel(oViewModel, "appView");

			fnSetAppNotBusy = function () {
				oViewModel.setProperty("/busy", false);
				oViewModel.setProperty("/delay", iOriginalBusyDelay);
			};

			this.getOwnerComponent().getModel().metadataLoaded().then(fnSetAppNotBusy);

			// apply content density mode to root view
			this.getView().addStyleClass(this.getOwnerComponent().getContentDensityClass());
		},

		onExit: function () {
			CommonModelManager.resetApplicationState("MYLEAVEREQUESTS");
		}

	});

});