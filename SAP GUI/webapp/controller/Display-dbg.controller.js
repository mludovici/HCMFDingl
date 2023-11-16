/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([
	"hcm/fab/myleaverequest/utils/utils",
	"hcm/fab/myleaverequest/utils/formatters",
	"hcm/fab/myleaverequest/controller/BaseController",
	"sap/ui/core/routing/History",
	"sap/ui/model/json/JSONModel",
	"sap/ui/core/format/DateFormat",
	"sap/m/Label",
	"sap/m/Text",
	"sap/m/LabelDesign",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/m/MessagePopover",
	"sap/m/MessagePopoverItem"
], function (utils, formatters, BaseController, History, JSONModel, DateFormat, Label, Text, LabelDesign, MessageBox, MessageToast,
	MessagePopover,
	MessagePopoverItem) {
	"use strict";

	return BaseController.extend("hcm.fab.myleaverequest.controller.Display", {

		_oMessagePopover: null,
		formatter: formatters,
		utils: utils,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		/**
		 * Called when a controller is instantiated and its View controls (if available) are already created.
		 * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
		 */
		onInit: function () {
			this.oErrorHandler = this.getOwnerComponent().getErrorHandler();

			this._oNotesModel = new JSONModel({
				NoteCollection: []
			});
			this.setModel(this._oNotesModel, "noteModel");

			this._oDisplayViewModel = new JSONModel({
				busy: true,
				isDataLoading: true,
				isTeamCalendarVisible: false,
				aAttachments: []
			});
			this.setModel(this._oDisplayViewModel, "display");

			this._bIsBookmarkNavigation = false;

			this.getRouter().getRoute("display").attachPatternMatched(this._onDisplayMatched, this);

			var oStatus = this.byId("status");
			if (oStatus && oStatus.getMetadata().hasProperty("inverted")) {
				oStatus.setInverted(true);
			}

			// Configure teamcalendar refresh on leaverequest changes, if available
			var oCalendar = this.getView().byId("teamCalendar");
			if (oCalendar && oCalendar.getMetadata().hasProperty("dataChangedDate")) {
				oCalendar.bindProperty("dataChangedDate", {
					path: "/lastLeaveRequestChangeDate",
					model: "global",
					mode: "OneWay"
				});
			}
		},

		onExit: function () {
			this.oErrorHandler.clearErrors();
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */
		onEditRequest: function (oEvent) {
			utils.navTo.call(this, "edit", {
				leavePath: oEvent.getSource().getBindingContext().getPath().substr(1)
			});
		},

		onDeleteRequest: function (oEvent) {
			var oComponent = this.getOwnerComponent(),
				oContext = oEvent.getSource().getBindingContext(),
				sBindingPath = oContext.getPath(),
				oLeave = oContext.getProperty(sBindingPath),
				bIsPostedLeave = false;

			if (this.getModel("global").getProperty("/bEditRequestBeforeDeletion")) {
				if (oLeave.hasOwnProperty("ReqOrInfty")) {
					bIsPostedLeave = oLeave.ReqOrInfty === 'A' || oLeave.ReqOrInfty === 'P';
				} else {
					bIsPostedLeave = oLeave.StatusID === "POSTED" || oLeave.ChangeStateID === 0;
				}
			}
			if (bIsPostedLeave) {
				this.getRouter().navTo("delete", {
					leavePath: sBindingPath.substr(1)
				});
			} else {
				// get user confirmation first			
				MessageBox.confirm(this.getResourceBundle().getText("confirmDeleteMessage"), {
					styleClass: oComponent.getContentDensityClass(),
					initialFocus: MessageBox.Action.CANCEL,
					onClose: function (oAction) {
						if (oAction === MessageBox.Action.OK) {
							this._deleteRequest(sBindingPath);
						}
					}.bind(this)
				});
			}
		},

		onHandlePopover: function (oEvent) {
			var oMessagesButton = oEvent.getSource(),
				oView = this.getView();
			if (!this._oMessagePopover) {
				this._oMessagePopover = new MessagePopover({
					items: {
						path: "message>/",
						template: new MessagePopoverItem({
							description: "{message>description}",
							type: "{message>type}",
							title: "{message>message}",
							subtitle: "{message>additionalText}"
						})
					}
				});
				jQuery.sap.syncStyleClass(this.getOwnerComponent().getContentDensityClass(), oView, this._oMessagePopover);
				oView.addDependent(this._oMessagePopover);
			}
			this._oMessagePopover.toggle(oMessagesButton);
		},

		onNavBack: function () {
			this.oErrorHandler.clearErrors();

			var sPreviousHash = History.getInstance().getPreviousHash(),
				oCrossAppNavigator = sap.ushell && sap.ushell.Container && sap.ushell.Container.getService("CrossApplicationNavigation");

			setTimeout(function () {
				this._oDisplayViewModel.setProperty("/isTeamCalendarVisible", false);
				this.getView().setBindingContext(null);
			}.bind(this), 200);

			if (this._bIsBookmarkNavigation) {
				this._bIsBookmarkNavigation = false;
				utils.navTo.call(this, "overview", false);
			} else if (sPreviousHash !== undefined || (oCrossAppNavigator && !oCrossAppNavigator.isInitialNavigation())) {
				if (oCrossAppNavigator) {
					oCrossAppNavigator.historyBack();
				} else {
					window.history.go(-1);
				}
			} else {
				// Navigate back to FLP home
				oCrossAppNavigator.toExternal({
					target: {
						shellHash: oCrossAppNavigator.hrefForExternal({
							target: {
								shellHash: "#"
							}
						})
					}
				});
			}
		},

		/* =========================================================== */
		/* internal methods                                            */
		/* =========================================================== */
		_onDisplayMatched: function (oEvent) {
			this.oErrorHandler.clearErrors();
			var oParameter = oEvent.getParameter("arguments");
			this.getModel().metadataLoaded().then(function () {
				var oAssignmentPromise = this.getOwnerComponent().getAssignmentPromise();
				oAssignmentPromise.then(function (sEmployeeNumber) {
					var sObjectPath = oParameter.leavePath;
					this._bindView("/" + sObjectPath);
				}.bind(this));
			}.bind(this));
		},

		/**
		 * Binds the view to the object path. Makes sure that detail view displays
		 * a busy indicator while data for the corresponding element binding is loaded.
		 * @function
		 * @param {string} sLeavePath path to the object to be bound to the view.
		 * @private
		 */
		_bindView: function (sLeavePath) {
			var oDisplayView = this.getView(),
				oLeaveRequest = oDisplayView.getModel().getProperty(sLeavePath);

			if (!oLeaveRequest || oLeaveRequest.hasOwnProperty("ReqOrInfty")) {
				//data is not yet present in the ODATA-model or backend is updated as per SAP-note 2989229
				if (!oLeaveRequest) {
					//-> direct navigation to the detail page (e.g. via bookmark)
					this._bIsBookmarkNavigation = true;
				}
				this._oDisplayViewModel.setProperty("/busy", true);
				this._oDisplayViewModel.setProperty("/isDataLoading", true);
				this.oErrorHandler.setShowErrors("manual");

				oDisplayView.bindElement({
					path: sLeavePath,
					events: {
						change: function (oEvent) {
							if (!oDisplayView.getElementBinding().getBoundContext()) {
								setTimeout(function () { //wait for event "attachRequestFailed" to collect error messages in ErrorHandler.js
									this.oErrorHandler.displayErrorPopup(function () {
										utils.navTo.call(this, "overview");
										this._oDisplayViewModel.setProperty("/isDataLoading", false);
										this._oDisplayViewModel.setProperty("/busy", false);
										this.oErrorHandler.setShowErrors("immediately");
									}.bind(this));
								}.bind(this), 0);
							}

							var oData = oDisplayView.getBindingContext().getObject();
							if (oData) {
								//data could be retrieved from the backend
								this._handleDisplayLeave(oData);
							}
						}.bind(this)
					}
				});

			} else {
				//data is already in present in the ODATA-model
				var oContext = new sap.ui.model.Context(oDisplayView.getModel(), sLeavePath);
				oDisplayView.setBindingContext(oContext);

				this._handleDisplayLeave(oContext.getProperty(sLeavePath));
			}
		},

		_handleDisplayLeave: function (oLeaveRequest) {
			//transform notes
			var sNoteString = oLeaveRequest.Notes,
				aNotes = this.formatter.formatNotes(sNoteString);
			this._oNotesModel.setProperty("/NoteCollection", aNotes);

			//transform attachments
			var aAttachments = Array.apply(null, {
				length: 5
			}).map(function (oUndefined, iIdx) {
				return oLeaveRequest["Attachment" + (iIdx + 1)];
			}).filter(function (oAttachment) {
				return oAttachment.FileName !== "";
			});

			this._oDisplayViewModel.setProperty("/aAttachments", aAttachments);
			this._oDisplayViewModel.setProperty("/isDataLoading", false);
			this._oDisplayViewModel.setProperty("/busy", false);
			this.oErrorHandler.setShowErrors("immediately");

			//show team calendar
			this._oDisplayViewModel.setProperty("/isTeamCalendarVisible", true);
		},
		/**
		 * Deletes the corresponding leave request from the ODATA-model
		 * @function
		 * @param {string} sBindingPath path to the leave request object in the model
		 * @private
		 */
		_deleteRequest: function (sBindingPath) {
			this._oDisplayViewModel.setProperty("/busy", true);
			this.getView().getModel().remove(sBindingPath, {
				success: function () {
					this._oDisplayViewModel.setProperty("/busy", false);
					//navigate to the List
					utils.navTo.call(this, "overview");
					//send event to refresh the overview page
					this.getOwnerComponent().getEventBus().publish("hcm.fab.myleaverequest", "invalidateoverview", {
						// Show toast after the navigation to the overview page
						fnAfterNavigate: function () {
							jQuery.sap.delayedCall(400, this, function () {
								MessageToast.show(this.getResourceBundle().getText("deletedSuccessfully"));
							});
						}.bind(this)
					});

				}.bind(this),
				error: function (oError) {
					this._oDisplayViewModel.setProperty("/busy", false);
				}.bind(this)
			});
		}
	});
});