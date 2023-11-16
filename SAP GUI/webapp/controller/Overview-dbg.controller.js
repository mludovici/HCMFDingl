/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([
	"hcm/fab/myleaverequest/utils/utils",
	"hcm/fab/myleaverequest/utils/formatters",
	"hcm/fab/myleaverequest/utils/CalendarUtil",
	"hcm/fab/myleaverequest/utils/DataUtil",
	"hcm/fab/lib/common/util/DateUtil",
	"sap/ui/Device",
	"hcm/fab/myleaverequest/controller/BaseController",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/core/routing/History",
	"sap/ui/core/format/DateFormat",
	"sap/ui/unified/DateRange",
	"sap/ui/unified/DateTypeRange",
	"sap/ui/unified/CalendarLegendItem",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/m/MessagePopover",
	"sap/m/MessagePopoverItem",
	"sap/m/SegmentedButton",
	"sap/m/Dialog",
	"jquery.sap.storage"
], function (utils, formatter, CalendarUtil, DataUtil, DateUtil, Device, BaseController, Filter, FilterOperator, History,
	DateFormat, DateRange,
	DateTypeRange, CalendarLegendItem, JSONModel, MessageBox, MessageToast, MessagePopover, MessagePopoverItem, SegmentedButton, Dialog,
	jQueryStorage) {
	"use strict";

	return BaseController.extend("hcm.fab.myleaverequest.controller.Overview", {

		CALENDARPERSKEY: "showCalendar",
		ENTITLEMENTSPERSKEY: "expandEntitlements",
		OVERVIEWPERSKEY: "expandOverview",
		oStorage: jQuery.sap.storage(jQuery.sap.storage.Type.local),
		formatter: formatter,
		DateUtil: DateUtil,
		extHookAdjustOverviewCalendar: null,

		onInit: function () {
			// Model used to manipulate control states
			var bShowCalendar = this.oStorage.get(this.CALENDARPERSKEY) !== null ? this.oStorage.get(this.CALENDARPERSKEY) : false;

			this._oOverviewModel = new JSONModel({
				showCalendar: bShowCalendar,
				viewSelection: bShowCalendar ? "calendar" : "list",
				entCount: 0,
				overviewCount: 0,
				overviewCountText: this.getResourceBundle().getText("items", ["0"]),
				entitlementsExpanded: this.oStorage.get(this.ENTITLEMENTSPERSKEY) !== null ? this.oStorage.get(this.ENTITLEMENTSPERSKEY) : true,
				overviewExpanded: this.oStorage.get(this.OVERVIEWPERSKEY) !== null ? this.oStorage.get(this.OVERVIEWPERSKEY) : true,
				calendarBusy: false,
				isLeaveLoading: false,
				isDeletingLeaveRequest: false,
				entitlementStartDate: new Date(),
				nonWorkingDays: null,
				leaveRequestStartDate: null,
				showMinDisplayStrip: false,
				leaveRequestTableItems: []
			});

			this.setModel(this._oOverviewModel, "overview");

			this._oCalLegendItemPubHol = null;
			this._sEmployeeNumber = null;

			this.oComponent = this.getOwnerComponent();
			this.oODataModel = this.oComponent.getModel();
			this.oErrorHandler = this.oComponent.getErrorHandler();

			this._toggleCalendarModel(this._oOverviewModel.getProperty("/showCalendar"));
			this._toggleEntitlements(this._oOverviewModel.getProperty("/entitlementsExpanded"));
			this._toggleOverview(this._oOverviewModel.getProperty("/overviewExpanded"));

			this.getRouter().getRoute("overview").attachPatternMatched(this._onRouteMatched, this);

			this.oComponent.getEventBus().subscribe("hcm.fab.myleaverequest", "invalidateoverview", this.onInvalidateOverview, this);

			// Configure overview calendar
			var oCalendar = this.getView().byId("calendar");
			CalendarUtil.configureCalendar(oCalendar, this.oODataModel, this.getResourceBundle());

			// add Device-dependent style classes here (in XML this is not possible)
			if (Device.system.desktop) {
				this.byId("overviewOnBehalfIndicator").addStyleClass("sapUiResponsiveMargin");
				this.byId("quotaUsedColTxt").addStyleClass("sapUiLargeMarginEnd");
				this.byId("quotaUsedCell").addStyleClass("sapMTableContentMargin sapUiLargeMarginEnd");
			} else if (Device.system.tablet) {
				this.byId("overviewOnBehalfIndicator").addStyleClass("sapUiResponsiveMargin");
			} else {
				this.byId("overviewOnBehalfIndicator").addStyleClass("sapUiSmallMargin");
				this.byId("quotaUsedCell").addStyleClass("sapMTableContentMargin");
			}

			if (SegmentedButton.getMetadata().getEvent("selectionChange")) {
				this.byId("calendarToggleButton").attachEvent("selectionChange", this.onSelect.bind(this));
			} else {
				this.byId("calendarToggleButton").attachEvent("select", this.onSelect.bind(this));
			}

			/**    
			 * @ControllerHook
			 * Allows you to adjust the Overview Calendar. The hook gets called at the end of the
			 * onInit lifecycle method.
			 * @callback hcm.fab.myleaverequest.controller.Overview~extHookAdjustOverviewCalendar    
			 * @param {sap.ui.unified.Calendar} oCalendar
			 * @return {void}
			 */
			if (this.extHookAdjustOverviewCalendar) {
				this.extHookAdjustOverviewCalendar(oCalendar);
			}
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */
		onExit: function () {
			this.oErrorHandler.clearErrors();
			if (this._oQuickView) {
				this._oQuickView.destroy();
				this._oQuickView = undefined;
			}
		},

		onInvalidateOverview: function (sChannelId, sEventId, oData) {
			// leave request changed -> update change date in global model for teamcalendar refresh
			this.getModel("global").setProperty("/lastLeaveRequestChangeDate", new Date());
			// execute the afterNavigate function (if present)
			if (oData.fnAfterNavigate) {
				oData.fnAfterNavigate();
			}

			this._oDataUtil.refresh();
			this._refreshAbsences();
			this._refreshEntitlements();
		},

		onAssignmentSwitch: function (oEvent) {
			var oAssignmentPromise = this.getOwnerComponent().getAssignmentPromise(oEvent.getParameter("selectedAssignment"));
			oAssignmentPromise.then(function (sEmployeeNumber) {
				this._initOverviewModelBinding(sEmployeeNumber);
			}.bind(this));
		},

		onEntitlementDateChanged: function (oEvent) {
			var oNewDate = DateFormat.getDateInstance().parse(oEvent.getParameter("newValue")),
				bValid = oEvent.getParameter("valid"),
				oDatePicker = oEvent.getSource(),
				oBinding = this.getView().byId("entitlementTable").getBinding("items");
			this._oOverviewModel.setProperty("/entitlementStartDate", oNewDate);
			if (oNewDate && bValid) {
				oDatePicker.setValueState(sap.ui.core.ValueState.None);

				oBinding.filter([new Filter("FilterStartDate", FilterOperator.GE, utils.dateToUTC(oNewDate)), new Filter("EmployeeID",
					FilterOperator.EQ, this.getModel("global").getProperty("/sEmployeeNumber"))], "Application");
			} else {
				oDatePicker.setValueState(sap.ui.core.ValueState.Error);
			}
		},

		onUpdateFinishedEntitlements: function (oEvent) {
			this._oOverviewModel.setProperty("/entCount", oEvent.getParameter("total"));
		},

		onUpdateFinishedOverview: function (oEvent) {
			this._oOverviewModel.setProperty("/overviewCount", oEvent.getParameter("total"));
			this._oOverviewModel.setProperty("/overviewCountText", this.getResourceBundle().getText("items", [oEvent.getParameter("total")]));
		},

		/**
		 * Event handler when the createLeave Button got pressed
		 * @param {sap.ui.base.Event} oEvent the table selectionChange event
		 * @public
		 */
		onCreateLeave: function () {
			// The source is the list item that got pressed
			var oCalendar = this.getView().byId("calendar"),
				aSelectedDates = oCalendar.getSelectedDates(),
				oRouter = this.getRouter();
			if (aSelectedDates.length === 0) {
				oRouter.navTo("creation");
			} else {
				var dateRange = aSelectedDates[0],
					oStartDate = utils.dateToUTC(dateRange.getStartDate());
				oCalendar.destroySelectedDates();
				oRouter.navTo("creationWithParams", {
					dateFrom: "" + oStartDate.getTime(),
					dateTo: "" + oStartDate.getTime(),
					absenceType: "default",
					sEmployeeID: this.getModel("global").getProperty("/sEmployeeNumber")
				});
			}
		},

		onClose: function () {
			this.oDialog.close();
		},

		onItemPressed: function (oEvent) {
			var oContext = oEvent.getParameter("listItem").getBindingContext("overview");
			var oLeave = oContext.getModel().getProperty(oContext.getPath());
			var sPath = this.getModel().createKey("/LeaveRequestSet", oLeave).substr(1);
			this.getRouter().navTo("display", {
				leavePath: sPath
			});
		},
		onEntitlementItemPressed: function (oEvent) {
			var oContext = oEvent.getParameter("listItem").getBindingContext();

			if (!this._oQuickView) {
				this._oQuickView = sap.ui.xmlfragment("hcm.fab.myleaverequest.view.fragments.EntitlementDetail", this);
				this.getView().addDependent(this._oQuickView);
			}
			this._oQuickView.setBindingContext(oContext);
			this._oQuickView.openBy(oEvent.getSource());
		},

		onHandlePopover: function (oEvent) {
			var oMessagesButton = oEvent.getSource(),
				oView = this.getView();
			if (!this._oMessagePopover) {
				this._oMessagePopover = new MessagePopover({
					items: {
						path: "message>/",
						template: new MessagePopoverItem({
							type: "{message>type}",
							title: "{message>message}",
							subtitle: "{message>additionalText}",
							description: "{message>code}"
						})
					}
				});
				jQuery.sap.syncStyleClass(this.getOwnerComponent().getContentDensityClass(), oView, this._oMessagePopover);
				oView.addDependent(this._oMessagePopover);
			}
			this._oMessagePopover.toggle(oMessagesButton);
		},

		/**
		 * Event handler for navigating back.
		 * It there is a history entry or an previous app-to-app navigation we go one step back in the browser history
		 * If not, it will navigate to the shell home
		 * @public
		 */
		onNavBack: function () {
			this.oErrorHandler.clearErrors();

			var sPreviousHash = History.getInstance().getPreviousHash(),
				oCrossAppNavigator = sap.ushell && sap.ushell.Container && sap.ushell.Container.getService("CrossApplicationNavigation");

			if (sPreviousHash !== undefined || (oCrossAppNavigator && !oCrossAppNavigator.isInitialNavigation())) {
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

		onDeleteSwipe: function (oEvent) {
			this._deleteRequest(oEvent.getSource().getParent().getSwipedItem());
		},

		onDeletePress: function (oEvent) {
			var oList = oEvent.getSource(),
				oItem = oEvent.getSource().getParent(),
				oComponent = this.getOwnerComponent(),
				oLeave = oItem.getBindingContext("overview").getObject(),
				sPath = this.getModel().createKey("/LeaveRequestSet", oLeave).substr(1),
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
					leavePath: sPath
				});
			} else {
				// get user confirmation first	
				MessageBox.confirm(this.getResourceBundle().getText("confirmDeleteMessage"), {
					styleClass: oComponent.getContentDensityClass(),
					initialFocus: MessageBox.Action.CANCEL,
					onClose: function (oAction) {
						if (oAction === MessageBox.Action.OK) {
							// after deletion put the focus back to the list
							oList.attachEventOnce("updateFinished", oList.focus, oList);
							this._deleteRequest(oItem);
						}
					}.bind(this)
				});
			}
		},

		onEditPress: function (oEvent) {
			var oContext = oEvent.getSource().getBindingContext("overview");
			var oLeave = oContext.getModel().getProperty(oContext.getPath());
			var sPath = this.getModel().createKey("/LeaveRequestSet", oLeave).substr(1);
			this.getRouter().navTo("edit", {
				leavePath: sPath
			});
		},

		onLeaveOverviewDateChanged: function (oEvent) {
			var oDateFormat = DateFormat.getDateInstance({
					UTC: true
				}),
				oNewDate = oDateFormat.parse(oEvent.getParameter("newValue")),
				oOverviewDatePicker = oEvent.getSource();

			if (oNewDate) {
				// check whether date is before "minDisplayDate" for the overview list
				// if so -> warning message strip is shown and date is reset
				var oMinDisplayDate = this.getModel("global").getProperty("/leaveRequestMinDisplayDate");
				if (oNewDate.getTime() < oMinDisplayDate.getTime()) {
					oOverviewDatePicker.setValueState(sap.ui.core.ValueState.Warning);
					oOverviewDatePicker.setValueStateText(this.getResourceBundle().getText("minDisplayDateTxt", [oDateFormat.format(
						oMinDisplayDate)]));

					oNewDate = oMinDisplayDate;
					this._oOverviewModel.setProperty("/showMinDisplayStrip", true);
				} else {
					oOverviewDatePicker.setValueState(sap.ui.core.ValueState.None);
					oOverviewDatePicker.setValueStateText(null);
					this._oOverviewModel.setProperty("/showMinDisplayStrip", false);
				}

				this._oOverviewModel.setProperty("/leaveRequestStartDate", oNewDate);

				// focus the newly entered date in the calendar
				var oCalendar = this.getView().byId("calendar");
				oCalendar.focusDate(oNewDate);

				this._bindLeaveRequestList(oNewDate);

			} else {
				oOverviewDatePicker.setValueState(sap.ui.core.ValueState.Error);
			}
		},

		onCloseMinDispMessStrip: function () {
			var oOverviewDatePicker = this.getView().byId("overviewDatePicker");
			oOverviewDatePicker.setValueState(sap.ui.core.ValueState.None);
			oOverviewDatePicker.setValueStateText(null);
		},

		onCalendarDateSelect: function (oEvent) {
			var oCalendar = oEvent.getSource(),
				oRouter = this.getRouter(),
				oSelectedDateRange = oCalendar.getSelectedDates()[0],
				oStartDate = DateUtil.convertToUTC(oSelectedDateRange.getStartDate()),
				oEndDate = DateUtil.convertToUTC(oSelectedDateRange.getEndDate());
			if (oEndDate) {
				// Start AND end date selected: Navigate to create screen and pass selected dates
				oCalendar.destroySelectedDates();
				oRouter.navTo("creationWithParams", {
					dateFrom: "" + oStartDate.getTime(),
					dateTo: "" + oEndDate.getTime(),
					absenceType: "default",
					sEmployeeID: this.getModel("global").getProperty("/sEmployeeNumber")
				});

			} else {
				// Clicked on single date: Search calendar for leave request during this day
				var oSpecialDateStartDateUTC = null,
					oSpecialDateEndDateUTC = null,
					aSpecialDates = oCalendar.getSpecialDates().filter(function (oSpecialDate) { //find leave requests on selected date
						oSpecialDateStartDateUTC = DateUtil.convertToUTC(oSpecialDate.getStartDate());
						oSpecialDateEndDateUTC = DateUtil.convertToUTC(oSpecialDate.getEndDate());
						return oSpecialDateStartDateUTC <= oStartDate && oSpecialDateEndDateUTC >= oStartDate && oSpecialDate.getType() !== sap.ui.unified
							.CalendarDayType.Type09;
					});

				// Found a leave request?
				if (aSpecialDates.length > 0) {
					oCalendar.destroySelectedDates();

					if (aSpecialDates.length === 1) {
						oRouter.navTo("display", {
							leavePath: aSpecialDates[0].data("path")
						});
					} else {
						//multiple leaves on that day -> display popup to choose the right one
						var aLeaves = [],
							oLeave = {},
							oOdataModel = this.getModel();

						aSpecialDates.forEach(function (oSpecialDate) {
							oLeave = oOdataModel.getObject("/" + oSpecialDate.data("path"));
							oLeave.sLeavePath = oSpecialDate.data("path");
							aLeaves.push(oLeave);
						});

						if (!this._multiLeaveDialog) {
							this._multiLeaveDialog = utils.setResizableDraggableForDialog(sap.ui.xmlfragment("hcm.fab.myleaverequest.view.fragments.MultiLeaveSelectDialog", this));
							var oStatus = this._multiLeaveDialog.getBindingInfo("items").template.getFirstStatus();
							if (oStatus && oStatus.getMetadata().hasProperty("inverted")) {
								oStatus.setInverted(true);
							}
							if (this._multiLeaveDialog._oDialog) {
								this._multiLeaveDialog._oDialog.getSubHeader().setVisible(false);
							}
							this._multiLeaveDialog.setModel(new JSONModel(), "multiLeave");
							this.getView().addDependent(this._multiLeaveDialog);
						}

						this._multiLeaveDialog.getModel("multiLeave").setData({
							aLeaves: aLeaves
						});

						this._multiLeaveDialog.open();
					}
				}
			}
		},

		onCalendarStartDateChange: function () {
			if (!this._oDataUtil) {
				// not yet initialized
				return;
			}

			var oCalendar = this.getView().byId("calendar"),
				oStartDate = oCalendar.getStartDate(),
				oEndDate = new Date(oStartDate.getFullYear(), oStartDate.getMonth() + oCalendar.getMonths(), 0),
				oMinDate = this._oOverviewModel.getProperty("/leaveRequestStartDate");
			if (oStartDate < oMinDate) {
				oStartDate = oMinDate;
			}

			oCalendar.removeAllSpecialDates();
			this._oOverviewModel.setProperty("/calendarBusy", true);
			this._oDataUtil.getCalendarEvents(oStartDate, oEndDate).then(function (oResult) {
				this._oOverviewModel.setProperty("/calendarBusy", false);
				CalendarUtil.fillCalendarWithLeaves(oCalendar, oResult.leaveRequests, oStartDate, oEndDate);
				CalendarUtil.fillCalendarFromEmployeeCalendar(oCalendar, oResult.workSchedule);
				jQuery.sap.delayedCall(0, oCalendar, oCalendar.invalidate, [true]);
			}.bind(this));
		},

		onSelect: function (oEvent) {
			var sSelectedKey = oEvent.getSource().getSelectedKey();
			if (sSelectedKey === "calendar" || sSelectedKey === "list") {
				this._toggleCalendarModel(sSelectedKey === "calendar");
			}
		},

		onEntitlementPanelExpand: function (oEvent) {
			this._toggleEntitlements(oEvent.getParameter("expand"));
		},
		onOverviewPanelExpand: function (oEvent) {
			this._toggleOverview(oEvent.getParameter("expand"));
		},

		onMultiLeaveConfirm: function (oEvent) {
			var sPath = oEvent.getParameter("selectedItem").getBindingContext("multiLeave").getProperty("sLeavePath");
			this.getRouter().navTo("display", {
				leavePath: sPath
			});
		},

		/* =========================================================== */
		/* internal methods                                            */
		/* =========================================================== */
		_toggleCalendarModel: function (bShowCal) {
			this._oOverviewModel.setProperty("/showCalendar", bShowCal);
			this._oOverviewModel.setProperty("/viewSelection", bShowCal ? "calendar" : "list");
			this.oStorage.put(this.CALENDARPERSKEY, bShowCal);

			// update calendar entries
			if (bShowCal) {
				// calendar.getStartDate only works reliable if calendar was rendered once (so delay the call..)
				jQuery.sap.delayedCall(0, this, this.onCalendarStartDateChange);
			}
		},

		_onRouteMatched: function (oEvent) {
			this.oODataModel.metadataLoaded().then(function () {
				var oAssignmentPromise = this.getOwnerComponent().getAssignmentPromise();
				oAssignmentPromise.then(function (sEmployeeNumber) {
					this._initOverviewModelBinding(sEmployeeNumber);
				}.bind(this));
				this.oErrorHandler.setShowErrors("immediately");
				this.oErrorHandler.clearErrors();
			}.bind(this));
		},

		_initOverviewModelBinding: function (sEmployeeId) {
			if (this._sEmployeeNumber !== sEmployeeId) {
				this._sEmployeeNumber = sEmployeeId;

				// Read the available entitlements
				this._readEntitlements(sEmployeeId);

				// Read Leave Request with in sync with Default Start value
				this._readLeaveRequestWithDefaultStartDate(sEmployeeId);
			}
		},

		_readEntitlements: function (sEmployeeId) {
			this._oEntitlementColumListItemTemplate = this._oEntitlementColumListItemTemplate ? this._oEntitlementColumListItemTemplate.clone() :
				this.getView().byId("entitlementColumnListItem");
			// Init Entitlement table            
			this.getView().byId("entitlementTable").bindItems({
				path: "/TimeAccountSet",
				groupId: "entitlements",
				template: this._oEntitlementColumListItemTemplate,
				filters: this._getActiveBaseFiltersForTimeAccount(this._oOverviewModel.getProperty("/entitlementStartDate"), sEmployeeId)
			});
		},

		_readLeaveRequestWithDefaultStartDate: function (employeeId) {
			this._bindLeaveRequestList(this.getModel("global").getProperty("/defaultFilterDate"), employeeId);
		},

		_bindLeaveRequestList: function (startDate, employeeId) {
			this._oOverviewModel.setProperty("/isLeaveLoading", true);

			var sEmployeeId = employeeId === undefined ? this.getModel("global").getProperty("/sEmployeeNumber") : employeeId;

			//Set Date Picker on top of the list accordingly
			this._oOverviewModel.setProperty("/leaveRequestStartDate", startDate);

			// update data manger in case assignment changed
			this._oDataUtil = DataUtil.getInstance(sEmployeeId, this.oODataModel);
			this._oDataUtil.getCalendarEvents(utils.dateToLocal(startDate)).then(function (oResult) {
				this._oOverviewModel.setProperty("/leaveRequestTableItems", oResult.leaveRequests);
				this._oOverviewModel.setProperty("/isLeaveLoading", false);

			}.bind(this));

			// only update the calendar if it is visible (else it will become invisible forever)
			if (this._oOverviewModel.getProperty("/showCalendar")) {
				this.onCalendarStartDateChange();
			}
		},

		_getActiveBaseFiltersForTimeAccount: function (startDate, employeeId) {
			return [new Filter("FilterStartDate", FilterOperator.GE, utils.dateToUTC(startDate)), new Filter("EmployeeID",
				FilterOperator.EQ, employeeId)];
		},

		_refreshAbsences: function () {
			var oStartDate = this._oOverviewModel.getProperty("/leaveRequestStartDate");
			this._bindLeaveRequestList(oStartDate);
		},
		_refreshEntitlements: function () {
			var oEntitlementTableBinding = this.getView().byId("entitlementTable").getBinding("items");
			oEntitlementTableBinding.refresh();
		},

		_deleteRequest: function (oItem) {
			// Busy handling
			this._oOverviewModel.setProperty("/isDeletingLeaveRequest", true);

			var oLeave = oItem.getBindingContext("overview").getObject(),
				sBindingPath = this.getModel().createKey("/LeaveRequestSet", oLeave);

			this.oODataModel.remove(sBindingPath, {
				success: function () {
					this._oOverviewModel.setProperty("/isDeletingLeaveRequest", false);

					// communicate new leave request change date to team calendar
					this.getModel("global").setProperty("/lastLeaveRequestChangeDate", new Date());

					//Show message toast about successful deletion
					MessageToast.show(this.getResourceBundle().getText("deletedSuccessfully"));

					//Refresh all depenedent entities
					this._oDataUtil.refresh();
					this._refreshEntitlements();
					this._refreshAbsences();
				}.bind(this),
				error: function (oError) {
					this._oOverviewModel.setProperty("/isDeletingLeaveRequest", false);
				}.bind(this)
			});
		},

		_toggleEntitlements: function (bExpand) {
			this.oStorage.put(this.ENTITLEMENTSPERSKEY, bExpand);
			this._oOverviewModel.setProperty("/entitlementsExpanded", bExpand);
		},
		_toggleOverview: function (bExpand) {
			this.oStorage.put(this.OVERVIEWPERSKEY, bExpand);
			this._oOverviewModel.setProperty("/overviewExpanded", bExpand);
		}
	});
});