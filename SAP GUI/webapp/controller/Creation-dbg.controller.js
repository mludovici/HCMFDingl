/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([
	"hcm/fab/myleaverequest/utils/formatters",
	"hcm/fab/myleaverequest/utils/utils",
	"hcm/fab/myleaverequest/controller/BaseController",
	"hcm/fab/myleaverequest/utils/DataUtil",
	"hcm/fab/myleaverequest/utils/CalendarUtil",
	"sap/ui/Device",
	"sap/ui/core/routing/History",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Context",
	"sap/ui/model/odata/type/Decimal",
	"sap/ui/base/Event",
	"sap/m/Label",
	"sap/m/Input",
	"sap/m/Title",
	"sap/m/MessagePopover",
	"sap/m/MessagePopoverItem",
	"sap/m/MessageToast",
	"sap/m/MessageBox",
	"sap/m/ToolbarSpacer",
	"sap/m/ProgressIndicator",
	"sap/m/OverflowToolbar",
	"sap/m/ObjectAttribute",
	"sap/m/UploadCollection",
	"sap/m/UploadCollectionItem",
	"sap/m/UploadCollectionParameter",
	"sap/ui/model/json/JSONModel",
	"sap/ui/core/format/DateFormat",
	"hcm/fab/lib/common/controls/TeamCalendarControl",
	"hcm/fab/lib/common/util/DateUtil",
	"sap/m/Dialog",
	"sap/m/Button",
	"sap/m/StandardListItem",
	"sap/m/DateRangeSelection",
	"sap/m/DatePicker"
], function (formatter, utils, BaseController, DataUtil, CalendarUtil, Device, History, Filter, FilterOperator, Context, Decimal, Event,
	Label, Input, Title,
	MessagePopover,
	MessagePopoverItem,
	MessageToast,
	MessageBox, ToolbarSpacer, ProgressIndicator, OverflowToolbar, ObjectAttribute,
	UploadCollection, UploadCollectionItem, UploadCollectionParameter, JSONModel,
	DateFormat, TeamCalendarControl, DateUtil, Dialog, Button, StandardListItem, DateRangeSelection, DatePicker) {
	"use strict";

	var I_MAX_APPROVERS = 5;
	var I_MAX_ATTACHMENTS = 5;

	/* These fields from the LOCAL model should also cause data loss warnings */
	var LOCAL_MODEL_CHANGE_RELEVANT_PROPERTY_LIST = [
		"notes",
		"AdditionalFields"
	];

	var O_SEARCH_HELPER_MAPPINGS = {
		"CompCode": {
			keyField: "CompanyCodeID",
			titleField: "CompanyCodeID",
			descriptionField: "CompanyCodeText",
			searchFields: "CompanyCodeID,CompanyCodeText"
		},
		"DescIllness": { // Desc. Illness
			keyField: "IllnessCode",
			titleField: "IllnessCode",
			descriptionField: "IllnessDescTxt",
			searchFields: "IllnessCode,IllnessDescTxt"
		},
		"CostCenter": {
			keyField: "CostCenterID",
			titleField: "CostCenterID",
			descriptionField: "CostCenterText",
			searchFields: "CostCenterID,CostCenterText"
		},
		"OtCompType": { // OT comp. type
			keyField: "OverTimeCompID",
			titleField: "OverTimeCompID",
			descriptionField: "OverTimeCompText",
			searchFields: "OverTimeCompID,OverTimeCompText"
		},
		"TaxArea": { // Tax Area
			keyField: "WorkTaxAreaID",
			titleField: "WorkTaxAreaID",
			descriptionField: "WorkTaxAreaDesciption",
			searchFields: "WorkTaxAreaDesciption"
		},
		"ObjectType": {
			keyField: "ObjtypeID",
			titleField: "ObjtypeID",
			descriptionField: "ObjTypetext",
			searchFields: "ObjtypeID,ObjTypetext"
		},
		"WageType": { // Wage Type
			keyField: "WageTypeID",
			titleField: "WageTypeID",
			descriptionField: "WageTypeText",
			searchFields: "WageTypeID,WageTypeText"
		},
		"OrderID": { // Order
			keyField: "OrderNumID",
			titleField: "OrderNumID",
			descriptionField: "OrderNumText",
			searchFields: "OrderNumID,OrderNumText"
		}
	};

	/* global Promise */

	return BaseController.extend("hcm.fab.myleaverequest.controller.Creation", {
		oCreateModel: null,
		sCEEmployeeId: undefined,
		formatter: formatter,
		utils: utils,
		oUploadCollection: null,
		oUploadSet: null,
		_messagesPopover: null,
		_notesBuffer: null,
		_oMessagePopover: null,
		_oNewFileData: {},
		_oControlToFocus: null,
		_bCheckboxFieldsAreBoolean: false,
		_bApproverOnBehalfPropertyExists: false,
		_oSearchApproverItemTemplate: null,
		_bCheckLeaveSpanFIDateIsEdmTime: false,
		_bQuotaAvailabilityFIHasDateParams: false,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		/**
		 * Called when a controller is instantiated and its View controls (if available) are already created.
		 * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
		 * @memberOf hcm.fab.myleaverequest.view.Creation
		 */
		onInit: function () {
			var oOwnerComponent = this.getOwnerComponent(),
				oRouter = oOwnerComponent.getRouter();

			// Contains "instantiated" fragments
			this._oAdditionalFieldsControls = {};

			//
			// Setup a deferred object with a promise resolved when data about
			// absence type are received.
			//
			this._absenceTypeReceivedDeferred = utils.createDeferred();

			oRouter.getRoute("creation").attachPatternMatched(this._onCreateRouteMatched, this);
			oRouter.getRoute("creationWithParams").attachPatternMatched(this._onCreateRouteMatched, this);
			oRouter.getRoute("edit").attachPatternMatched(this._onEditRouteMatched, this);
			oRouter.getRoute("delete").attachPatternMatched(this._onDeletePostedLeaveRouteMatched, this);

			this._oNotesModel = new JSONModel({
				NoteCollection: []
			});
			this.setModel(this._oNotesModel, "noteModel");

			this.oCreateModel = new JSONModel();
			this.setModel(this.oCreateModel, "create");
			this.initLocalModel();

			this.oODataModel = oOwnerComponent.getModel();
			this.oErrorHandler = oOwnerComponent.getErrorHandler();
			this._oAttachmentsContainer = this.byId("attachmentsContainer");

			if (!Device.system.phone) {
				this.byId("leaveTypeSelectionForm").addDependent(this.byId("absDescLink"));
			}

			// register on changes for local and odata model in order to enable/disable the save button
			this.oCreateModel.attachPropertyChange(this._revalidateSaveButtonStatus, this);
			this.oODataModel.attachPropertyChange(this._revalidateSaveButtonStatus, this);

			// Init SAPUI5-dependent UI settings
			if (DatePicker.getMetadata().hasEvent("navigate")) { // Since 1.46
				this.getView().byId("startDate").attachNavigate(this.onCalendarNavigate, this);
			}
			if (DateRangeSelection.getMetadata().hasEvent("navigate")) { // Since 1.46
				this.getView().byId("dateRange").attachNavigate(this.onCalendarNavigate, this);
			}

			this.oODataModel.getMetaModel().loaded().then(function () {
				var oAddFieldMetaInfo = this._getAdditionalFieldMetaInfo("PrevDay"); //pick 1 property that was changed with SAP-note 2732263
				this._bCheckboxFieldsAreBoolean = oAddFieldMetaInfo.type === "Edm.Boolean";
				var oLeaveSpanMetaInfo = this._getLeaveSpanDateFieldMetaInfo("EndDate");
				this._bCheckLeaveSpanFIDateIsEdmTime = oLeaveSpanMetaInfo.type === "Edm.DateTime";
				this._bApproverOnBehalfPropertyExists = this._checkForSearchApproverPropertyExistence();
				this._bQuotaAvailabilityFIHasDateParams = this._quotaAvailabilityFIHasDateParams();
			}.bind(this));
		},

		initLocalModel: function () {
			this.setModelProperties(this.oCreateModel, {
				"uploadPercentage": 0,
				"multiOrSingleDayRadioGroupIndex": 0, // bound TwoWay in view
				"isQuotaCalculated": undefined,
				"BalanceAvailableQuantityText": undefined,
				"TimeUnitName": undefined,
				"attachments": [],
				"isAttachmentMandatory": false,
				"isAttachmentUploadEnabled": true,
				"notes": "",
				"showDatePicker": false,
				"showRange": true,
				"usedWorkingTime": undefined,
				"usedWorkingTimeUnit": undefined,
				"aProposedApprovers": [],
				"AdditionalFields": [],
				"showTimePicker": false,
				"showInputHours": false,
				"timePickerFilled": false,
				"inputHoursFilled": false,
				"viewTitle": null,
				"busy": false,
				"sEditMode": null,
				"sAttachmentsTitle": this.getResourceBundle().getText("attachmentToolbarTitle", [0]),
				"iMaxApproverLevel": 0,
				"iCurrentApproverLevel": 0,
				"IsMultiLevelApproval": false,
				"isApproverEditable": false,
				"isApproverVisible": false,
				"isLoadingApprovers": false,
				"isAddDeleteApproverAllowed": false,
				"isNoteVisible": false,
				"AbsenceDescription": "",
				"AbsenceTypeName": "",
				"bUseDateDefaults": true,
				"oLeaveStartDate": null,
				"oLeaveEndDate": null,
				"sDateRangeValueState": sap.ui.core.ValueState.None,
				"isSaveRequestPending": false,
				"saveButtonEnabled": false,
				"calendar": {
					overlapNumber: 0,
					assignmentId: this.sCEEmployeeId,
					opened: false
				}
			}, undefined, false);
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		/*
		 * Handler for the 'dataReceived' event on the Select control. It
		 * indicates that the control has items in the dropdown list to be
		 * rendered.
		 */
		onAbsenceTypeReceived: function (oEvent) {
			var oParameters = oEvent.getParameter("data");
			if (!oParameters || (oParameters && !oParameters.results)) {
				this.sCEEmployeeId = null; //try to reload the data with the next call
				return;
			}
			this._absenceTypeReceivedDeferred.resolve(oParameters.results);
		},

		onNumberChange: function (oEvent) {
			// If a number field is empty, an error occurs in the backend.
			// So this sets a missing number to "0".
			var oField = oEvent.getSource(),
				sNumber = oField.getValue();
			if (sNumber === "") {
				oField.setValue("0");
			}
		},

		/**
		 * Called when the Controller is destroyed. Use this one to free resources and finalize activities.
		 * @memberOf hcm.fab.myleaverequest.view.Creation
		 */
		onExit: function () {
			this.oErrorHandler.clearErrors();
			this.oCreateModel.detachPropertyChange(this._revalidateSaveButtonStatus, this);
			this.oODataModel.detachPropertyChange(this._revalidateSaveButtonStatus, this);
			if (this._oDialog) {
				this._oDialog.destroy();
			}
			if (this._oSearchHelperDialog) {
				this._oSearchHelperDialog.destroy();
			}
			if (this._oOverlapCalendar) {
				this._oOverlapCalendar.destroy();
			}
			if (this._overlapDialog) {
				this._overlapDialog.destroy();
			}
			this._destroyAdditionalFields();
			this._cleanupUnsubmittedViewChanges();
		},

		/*
		 * Update the OData model with the local model and submit the
		 * changes.
		 */
		onSendRequest: function () {
			var oOriginalProperties = {},
				sPath = this.getView().getBindingContext().getPath();

			/* 
			ADDITIONAL FIELDS 
			*/
			this._copyAdditionalFieldsIntoModel(
				this.oCreateModel.getProperty("/AdditionalFields"),
				this.oODataModel,
				sPath
			);

			//check required fields
			if (!this._requiredAdditionalFieldsAreFilled()) {
				this.byId("createMessagesIndicator").focus();
				return;
			}

			//check for fields with errors
			if (this._checkFormFieldsForError()) {
				this.byId("createMessagesIndicator").focus();
				return;
			}

			/* 
			NOTES
			*/
			// Add note text if not empty
			var fSetNoteProperty = function (sPropertyPath, oValue) {
				var oOldValue = this.oODataModel.getProperty(sPropertyPath);
				if (oValue === oOldValue) {
					return;
				}
				if (oValue && oValue.equals && oValue.equals(oOldValue)) {
					return;
				}
				oOriginalProperties[sPropertyPath] = oOldValue;
				this.oODataModel.setProperty(sPropertyPath, oValue);
			}.bind(this);

			if (this.oCreateModel.getProperty("/notes")) {
				fSetNoteProperty(sPath + "/Notes", this.oCreateModel.getProperty("/notes"));
			} else {
				//If note text did not change keep the existing text (which means no update)
				fSetNoteProperty(sPath + "/Notes", this._notesBuffer);
			}

			/* 
			ATTACHMENTS
			*/
			var aUploadColletionItems = [];
			if (this.oUploadCollection) {
				aUploadColletionItems = this.oUploadCollection.getItems();
				if (aUploadColletionItems.length > I_MAX_ATTACHMENTS) {
					this.oErrorHandler.pushError(this.getResourceBundle().getText("txtMaxAttachmentsReached"));
					this.oErrorHandler.displayErrorPopup();
					this.oErrorHandler.setShowErrors("immediately");
					return;
				}
			} else if (this.oUploadSet) {
				aUploadColletionItems = this.oUploadSet.getItems().concat(this.oUploadSet.getIncompleteItems());
			}

			// Check if manadatory attachments exist
			if (this.oCreateModel.getProperty("/isAttachmentMandatory") && aUploadColletionItems.length === 0) {
				this.oErrorHandler.pushError(this.getResourceBundle().getText("txtAttachmentsRequired"));
				this.oErrorHandler.displayErrorPopup();
				this.oErrorHandler.setShowErrors("immediately");
				return;
			}

			// do necessary model updates for add and delete
			this._updateLeaveRequestWithModifiedAttachments(this.oODataModel, sPath);

			//In case of create mode: set the time based values to initial (if probably touched in between
			if ((this.oCreateModel.getProperty("/multiOrSingleDayRadioGroupIndex") === null) ||
				(this.oCreateModel.getProperty("/multiOrSingleDayRadioGroupIndex") === 0)) {
				this.oODataModel.setProperty(sPath + "/PlannedWorkingHours", "0.0");
				this.oODataModel.setProperty(sPath + "/StartTime", "");
				this.oODataModel.setProperty(sPath + "/EndTime", "");
			}

			//Note 2819539: Forward the information about a potential EditPostedLeave-Scenario - ActionID is 3 in this case
			if (this.oCreateModel.getProperty("/sEditMode") === "DELETE") {
				this.oODataModel.setProperty(sPath + "/ActionID", 3);
			}

			/* 
			HANDLE SUBMIT
			*/
			var fnError = function (oError) {
				this.oCreateModel.setProperty("/busy", false);
				this.oCreateModel.setProperty("/uploadPercentage", 0);

				// This addresses the current situation:
				//
				// 1. user enters some data in some of the fields
				// 2. submit error
				// 3. user deletes added fields
				// 4. submit success
				//
				Object.keys(oOriginalProperties).forEach(function (sInnerPath) {
					var oOriginalValue = oOriginalProperties[sInnerPath];

					this.oODataModel.setProperty(sInnerPath, oOriginalValue);
				}.bind(this));

				//cleanup of attachments recently added
				var oLeaveRequestToEdit = this.oODataModel.getProperty(sPath),
					sBasePropertyPath = "",
					sAttachmentProperty = "";

				for (var i = 0; i < I_MAX_ATTACHMENTS; i++) {
					sAttachmentProperty = "Attachment" + (i + 1);
					sBasePropertyPath = sPath + "/" + sAttachmentProperty;
					if (oLeaveRequestToEdit[sAttachmentProperty] && !this.oODataModel.getProperty(sBasePropertyPath + "/AttachmentStatus")) {
						this.oODataModel.setProperty(sBasePropertyPath, {
							FileName: "",
							FileType: "",
							FileSize: "0"
						});
					}
				}
			};

			if (this.oODataModel.hasPendingChanges()) {
				var oParams = {
					requestID: this.oODataModel.getProperty(sPath + "/RequestID"),
					aUploadedFiles: [], // information about each uploaded file,
					leavePath: sPath,
					showSuccess: true
				};

				//Forward the information whether we are running in a multiple approver scenario from AbsensceType to the LeaveRequest in create case
				this.oODataModel.setProperty(sPath + "/IsMultiLevelApproval", this.oCreateModel.getProperty("/IsMultiLevelApproval"));
				this.oCreateModel.setProperty("/busy", true);

				this.submitLeaveRequest(oParams)
					.then(this._uploadAttachments.bind(this))
					.then(this._showSuccessStatusMessage.bind(this))
					.catch(fnError.bind(this));

			} else if (this.oODataModel.getProperty(sPath + "/StatusID") === "REJECTED") {
				//if request was rejected the enduser should be able to resend the request without changing anything
				this.oCreateModel.setProperty("/busy", true);
				this.oODataModel.update(sPath, this.oODataModel.getObject(sPath), {
					success: function () {
						this._showSuccessStatusMessage();
					}.bind(this),
					error: function () {
						fnError.call(this);
					}.bind(this)
				});
			} else {
				//show message toast that nothing was changed
				MessageToast.show(this.getResourceBundle().getText("noChangesFound"));
			}
		},

		/**
		 * Event handler (attached declaratively) for the view cancel button. Asks the user confirmation to discard the changes. 
		 * @function
		 * @public
		 */
		onCancel: function () {
			this._confirmCancel();
		},

		submitLeaveRequest: function (oParams) {
			return new Promise(function (fnResolve, fnReject) {
				this.oCreateModel.setProperty("/isSaveRequestPending", true);
				this.oODataModel.submitChanges({
					success: function (oResultData, oResponse) {
						this.oCreateModel.setProperty("/isSaveRequestPending", false);
						var oBatchResponse = oResponse.data.__batchResponses[0],
							oSingleResponse = {};
						if (oBatchResponse.response) {
							oSingleResponse = oBatchResponse.response;
						} else if (oBatchResponse.__changeResponses) {
							oSingleResponse = oBatchResponse.__changeResponses[0];
						}

						if (oSingleResponse.statusCode.substr(0, 1) === "2") {
							//success
							if (oSingleResponse.headers.requestid) {
								oParams.requestID = oSingleResponse.headers.requestid;
							}
							fnResolve(oParams);

						} else {
							//error
							fnReject();
						}
					}.bind(this),
					error: function (oError) {
						//error
						this.oCreateModel.setProperty("/isSaveRequestPending", false);
						fnReject(oError);
					}.bind(this)
				});
			}.bind(this));
		},

		createLeaveRequestCollection: function () {
			return this.oODataModel.createEntry("/LeaveRequestSet", {
				properties: {
					StartDate: null,
					EndDate: null,
					StartTime: '',
					EndTime: ''
				}
			});
		},

		onAbsenceTypeChange: function (oEvent) {
			var oAbsenceTypeContext,
				oAbsenceTypeSelectedItem = oEvent.getParameter("selectedItem"),
				sLeaveRequestContextPath = this.getView().getBindingContext().getPath();

			if (oAbsenceTypeSelectedItem) {
				oAbsenceTypeContext = oAbsenceTypeSelectedItem.getBindingContext();
				this.updateOdataModel(oAbsenceTypeContext.getObject(), {});

				var oAdditionalFieldsDefinitions = oAbsenceTypeContext.getProperty("toAdditionalFieldsDefinition") || [],
					oAdditionalFieldsValues = this._getAdditionalFieldValues(
						oAdditionalFieldsDefinitions,
						this._getCurrentAdditionalFieldValues()
					),
					oAdditionalFields = {
						definition: oAdditionalFieldsDefinitions,
						values: oAdditionalFieldsValues

					};
				// important: unbind local model from additional fields when
				// changing it. Otherwise bad things will happen with unbound
				// fields.
				this._destroyAdditionalFields();

				var oAbsenceTypeData = oAbsenceTypeContext.getObject({
					expand: "toApprover"
				});
				this._handleApprovers(
					sLeaveRequestContextPath,
					oAbsenceTypeData.toApprover
				);

				this._updateLocalModel(
					oAdditionalFields,
					oAbsenceTypeData,
					this.oODataModel.getProperty(sLeaveRequestContextPath + "/StartDate"),
					this.oODataModel.getProperty(sLeaveRequestContextPath + "/EndDate")
				);

				// clear time / hour fields if they are not used by the new absence type. this prevents inconsistent
				// values to be sent to CalculateLeaveSpan which makes it return no result.
				if (!(oAbsenceTypeData.IsRecordInClockTimesAllowed && oAbsenceTypeData.IsAllowedDurationPartialDay)) {
					this.oODataModel.setProperty(sLeaveRequestContextPath + "/StartTime", "");
					this.oODataModel.setProperty(sLeaveRequestContextPath + "/EndTime", "");
				}
				if (!(oAbsenceTypeData.IsRecordInClockHoursAllowed && oAbsenceTypeData.IsAllowedDurationPartialDay)) {
					this.oODataModel.setProperty(sLeaveRequestContextPath + "/PlannedWorkingHours", "0.0");
				}

				this._handleAttachments(oAbsenceTypeContext.getObject());

				this._fillAdditionalFields(
					this.oCreateModel,
					oAbsenceTypeContext.getProperty("AbsenceTypeCode"),
					this._getAdditionalFieldsContainer()
				);

				this._fillAdditionalFieldTexts(oAdditionalFieldsDefinitions, oAdditionalFieldsValues);

				this._updateCalcLeaveDays(false);
			}
		},

		onShowLeaveTypeDescriptionPressed: function (oEvent) {
			if (!this._oLeaveTypeDescriptionDialog) {
				var oView = this.getView();
				this._oLeaveTypeDescriptionDialog = utils.setResizableDraggableForDialog(sap.ui.xmlfragment(
					"hcm.fab.myleaverequest.view.fragments.LeaveTypeDescriptionDialog", this));
				jQuery.sap.syncStyleClass(this.getOwnerComponent().getContentDensityClass(), oView, this._oLeaveTypeDescriptionDialog);

				//to get access to the global model
				oView.addDependent(this._oLeaveTypeDescriptionDialog);
			}

			this._oLeaveTypeDescriptionDialog.openBy(oEvent.getSource());
		},

		onSingleMultiDayRadioSelected: function (oEvent) {
			// get current start/end date
			var sCurrentLeaveRequestPath = this.getView().getBindingContext().getPath(),
				oCurrentStartDate = this.oODataModel.getProperty(sCurrentLeaveRequestPath + "/StartDate"),
				oCurrentEndDate = this.oODataModel.getProperty(sCurrentLeaveRequestPath + "/EndDate"),
				bIsMulti = oEvent.getSource().getSelectedIndex() === 0,
				bDateChanged = false;

			if (oCurrentStartDate) {
				if (oCurrentStartDate.getTime() !== oCurrentEndDate.getTime()) {
					bDateChanged = true;
				}
				if ((bIsMulti && !oCurrentEndDate) || (!bIsMulti)) {
					this.oODataModel.setProperty(sCurrentLeaveRequestPath + "/EndDate", oCurrentStartDate);
					this.oCreateModel.setProperty("/oLeaveEndDate", DateUtil.convertToLocal(oCurrentStartDate));
				}

				if (bDateChanged) {
					// must update the day count (single day is invisible)...
					this._updateCalcLeaveDays(false);

					if (!bIsMulti) {
						this._updateApprovers(this.getSelectedAbsenceTypeControl().getBindingContext().getObject(), oCurrentStartDate, oCurrentEndDate);
					}
				}
			}
		},

		onDateRangeChanged: function (oEvent) {
			var bValid = oEvent.getParameter("valid"),
				oStartDateLocal = oEvent.getParameter("from"),
				oStartDateUTC = utils.dateToUTC(oStartDateLocal),
				sStartDatePath = this.getView().getBindingContext().getPath("StartDate"),
				oEndDateLocal = oEvent.getParameter("to"),
				oEndDateUTC = utils.dateToUTC(oEndDateLocal),
				sEndDatePath = this.getView().getBindingContext().getPath("EndDate");

			if (bValid) {
				this.oCreateModel.setProperty("/bUseDateDefaults", false);
				if (!oEndDateLocal) {
					this.oCreateModel.setProperty("/oLeaveEndDate", oStartDateLocal);
					oEndDateUTC = oStartDateUTC;
				}
				this.oCreateModel.setProperty("/sDateRangeValueState", sap.ui.core.ValueState.None);
				this.oODataModel.setProperty(sStartDatePath, oStartDateUTC);
				this.oODataModel.setProperty(sEndDatePath, oEndDateUTC);
				this._updateCalcLeaveDays(false);
				this._updateAvailableQuota(this.getSelectedAbsenceTypeControl().getBindingContext().getObject(), oStartDateUTC, oEndDateUTC);
				this._updateApprovers(this.getSelectedAbsenceTypeControl().getBindingContext().getObject(), oStartDateUTC, oEndDateUTC);

				this._showBusyDialog(oEvent.getSource());

				// revalidate save button state
				this._revalidateSaveButtonStatus();
			} else {
				this.oCreateModel.setProperty("/sDateRangeValueState", sap.ui.core.ValueState.Error);
			}
		},

		onInputHoursChange: function (oEvent) {
			var fValue;
			if (this.getModel("global").getProperty("/bShowIndustryHours")) {
				var fLocal = parseFloat(oEvent.getParameter("value"), 10);
				fValue = isNaN(fLocal) ? 0 : fLocal;
			} else {
				fValue = this._convertHoursMinutesFromDateToDecimal(oEvent.getSource().getDateValue());
			}
			if (fValue <= 24) {
				//Set Start/End time to initial since it will be overruled
				var oContext = this.getView().getBindingContext(),
					sStartTimePath = oContext.getPath("StartTime"),
					sEndTimePath = oContext.getPath("EndTime"),
					sPlannedWorkingHoursPath = oContext.getPath("PlannedWorkingHours");

				this.oODataModel.setProperty(sStartTimePath, "");
				this.oODataModel.setProperty(sEndTimePath, "");
				//Set converted decimal hours from 60 minutes format 
				//as there is no direct value binding for the time picker (as for the input control)
				if (!this.getModel("global").getProperty("/bShowIndustryHours")) {
					this.oODataModel.setProperty(sPlannedWorkingHoursPath, fValue);
				}

				this._updateCalcLeaveDays(true);
				this._showBusyDialog(oEvent.getSource());
			}
			this.oCreateModel.setProperty("/inputHoursFilled", fValue !== 0 && fValue <= 24);
			this._revalidateSaveButtonStatus();
		},

		onDatePickChanged: function (oEvent) {
			var bValid = oEvent.getParameter("valid");
			if (bValid) {
				var oDate = DateFormat.getDateInstance({
						UTC: true
					}).parse(oEvent.getParameter("newValue"), true),
					sEndDatePath = this.getView().getBindingContext().getPath("EndDate");

				this.oCreateModel.setProperty("/bUseDateDefaults", false);
				this.oCreateModel.setProperty("/oLeaveStartDate", DateUtil.convertToLocal(oDate));
				this.oCreateModel.setProperty("/oLeaveEndDate", DateUtil.convertToLocal(oDate));
				this.oODataModel.setProperty(sEndDatePath, oDate);
				this._updateCalcLeaveDays(false);
				this._updateAvailableQuota(this.getSelectedAbsenceTypeControl().getBindingContext().getObject(), oDate, oDate);
				this._showBusyDialog(oEvent.getSource());
			}

			// revalidate save button state
			this._revalidateSaveButtonStatus();
		},

		onTimeChange: function (oEvent) {
			this.oCreateModel.setProperty("/timePickerFilled", (oEvent.getParameter("newValue")) ? true : false);

			//update information about used time
			this._updateCalcLeaveDays(false);
			this._showBusyDialog(oEvent.getSource());
		},

		onApproverValueHelp: function (oEvent) {
			if (!this._oDialog) {
				this._oDialog = utils.setResizableDraggableForDialog(sap.ui.xmlfragment(
					"hcm.fab.myleaverequest.view.fragments.ApproverDialog",
					this
				));
				jQuery.sap.syncStyleClass(this.getOwnerComponent().getContentDensityClass(), this.getView(), this._oDialog);
				this.getView().addDependent(this._oDialog);

				this._oSearchApproverItemTemplate = new StandardListItem({
					info: "{Information}",
					description: "{Description}",
					icon: {
						parts: ["global>/showEmployeePicture", "toEmployeePicture/__metadata/media_src"],
						formatter: formatter.formatImageURL
					},
					iconDensityAware: false,
					iconInset: false,
					title: {
						parts: ["global>/showEmployeeNumber", "global>/bShowEmployeeNumberWithoutZeros", "ApproverEmployeeName", "ApproverEmployeeID"],
						formatter: formatter.formatObjectTitle
					},
					adaptTitleSize: false,
					customData: [{
						key: "ApproverEmployeeID",
						value: "{ApproverEmployeeID}"
					}]
				});

				if (this._oSearchApproverItemTemplate.setWrapping) {
					this._oSearchApproverItemTemplate.setWrapping(true);
				}
			}

			// Recover the source control after the dialog is closed
			this._oDialog.data("initiator", oEvent.getSource());
			this._oDialog.data("approverLevel", oEvent.getSource().data("approverLevel"));
			this._oDialog.bindAggregation("items", {
				path: "/SearchApproverSet",
				filters: this._getApproverSearchFilters(),
				parameters: {
					custom: {}
				},
				template: this._oSearchApproverItemTemplate
			});
			this._oDialog.open();
		},

		onRemoveApproverClicked: function (oEvent) {
			var iCurrentLevel = this.oCreateModel.getProperty("/iCurrentApproverLevel"),
				sPath = this.getView().getBindingContext().getPath(),
				sBasePropertyPath = sPath + "/ApproverLvl" + iCurrentLevel;

			this.oODataModel.setProperty(sBasePropertyPath + "/Name", "");
			this.oODataModel.setProperty(sBasePropertyPath + "/Pernr", "000000");
			this.oODataModel.setProperty(sBasePropertyPath + "/Seqnr", "000");
			this.oODataModel.setProperty(sBasePropertyPath + "/DefaultFlag", false);

			this.oCreateModel.setProperty("/iCurrentApproverLevel", iCurrentLevel - 1);
		},

		onAddApproverClicked: function (oEvent) {
			var iCurrentLevel = this.oCreateModel.getProperty("/iCurrentApproverLevel"),
				aProposedApprovers = this.oCreateModel.getProperty("/aProposedApprovers"),
				oApprover = aProposedApprovers[iCurrentLevel];

			if (oApprover) {
				var sPath = this.getView().getBindingContext().getPath(),
					sBasePropertyPath = sPath + "/ApproverLvl" + (iCurrentLevel + 1);

				this.oODataModel.setProperty(sBasePropertyPath + "/Name", oApprover.Name);
				this.oODataModel.setProperty(sBasePropertyPath + "/Pernr", oApprover.Pernr);
				this.oODataModel.setProperty(sBasePropertyPath + "/Seqnr", oApprover.Seqnr);
				this.oODataModel.setProperty(sBasePropertyPath + "/DefaultFlag", oApprover.DefaultFlag);
			}

			this.oCreateModel.setProperty("/iCurrentApproverLevel", iCurrentLevel + 1);
		},

		onNotesLiveChange: function (oEvent) {
			var sText = oEvent.getParameter("newValue");
			if (sText.length < 2) {
				return;
			}
			if (sText.indexOf("::") > -1) {
				var iCursorPosition = oEvent.getSource().getFocusDomRef().selectionStart;
				oEvent.getSource().setValue(sText.replace(/(:)+/g, "$1"));

				// restore cursor position
				oEvent.getSource().getFocusDomRef().setSelectionRange(iCursorPosition, iCursorPosition - 1);
			}
		},

		onAdditionalFieldLiveChange: function (oEvent) {
			if (!oEvent.getParameter("newValue")) {
				this.oCreateModel.setProperty(oEvent.getSource().getBinding("value").getContext().getPath() + "/descriptionText", "");
			}
			this._checkRequiredField(oEvent.getSource());
		},

		onFileSizeExceeded: function (oEvent) {
			var oFileInfo = {},
				sFileName = "",
				iFileSizeInKB = 0,
				iMaxFileSizeMB = 0;
			if (oEvent.getSource().getMetadata().getName() === "sap.m.UploadCollection") {
				oFileInfo = oEvent.getParameter("files")[0];
				sFileName = oFileInfo.name;
				iFileSizeInKB = oFileInfo.fileSize * 1024; //oFileInfo.fileSize in MB
				iMaxFileSizeMB = oEvent.getSource().getMaximumFileSize();
			} else {
				var oItem = oEvent.getParameter("item");
				oFileInfo = oItem.getFileObject();
				if (!oFileInfo) {
					return;
				}
				sFileName = oFileInfo.name;
				iFileSizeInKB = oFileInfo.size / 1024; //oFileInfo.size in Bytes
				iMaxFileSizeMB = oEvent.getSource().getMaxFileSize();
				//ensure item is not attached
				oEvent.getSource().removeIncompleteItem(oItem);
			}
			MessageBox.warning(this.getResourceBundle().getText("attachmentFileSizeTooBig", [sFileName, formatter.formatFileSize(iFileSizeInKB),
				iMaxFileSizeMB
			]));
		},

		onFileTypeMissmatch: function (oEvent) {
			var sUnsupportedFileType = "",
				sCorrectFileTypes = "",
				aFileTypes = [];
			if (oEvent.getSource().getMetadata().getName() === "sap.m.UploadCollection") {
				sUnsupportedFileType = oEvent.getParameter("files")[0].fileType;
				aFileTypes = oEvent.getSource().getFileType();
				sCorrectFileTypes = aFileTypes.join(", ");
			} else {
				var oItem = oEvent.getParameter("item");
				aFileTypes = oEvent.getSource().getFileTypes();
				sUnsupportedFileType = this._getFileTypeFromFileName(oItem.getFileName());
				sCorrectFileTypes = aFileTypes.join(", ");

				//ensure item is not attached
				oEvent.getSource().removeIncompleteItem(oItem);
			}
			MessageBox.warning(this.getResourceBundle().getText(aFileTypes.length > 1 ? "attachmentWrongFileTypeMult" :
				"attachmentWrongFileType", [
					sUnsupportedFileType, sCorrectFileTypes
				]));
		},

		onBeforeUploadStartsSet: function (oEvent) {
			var oUploadSet = oEvent.getSource(),
				sEncodedFileName = jQuery.sap.encodeURL(oEvent.getParameter("item").getFileName());

			oUploadSet.destroyHeaderFields();
			//SLUG
			oUploadSet.addHeaderField(new sap.ui.core.Item({
				key: "slug",
				text: sEncodedFileName
			}));
			//X-CSRF-Token
			oUploadSet.addHeaderField(new sap.ui.core.Item({
				key: "x-csrf-token",
				text: this.oODataModel.getSecurityToken()
			}));
			//CONTENT-DISPOSITION header
			oUploadSet.addHeaderField(new sap.ui.core.Item({
				key: "Content-Disposition",
				text: "attachment;filename=" + sEncodedFileName
			}));
		},

		onBeforeAttachmentItemAdded: function (oEvent) {
			var oItem = oEvent.getParameter("item"),
				oNewFile = oItem.getFileObject(),
				bIsReplaced = false,
				aUploadedAttachments = oEvent.getSource().getItems(),
				aPendingUploads = oEvent.getSource().getIncompleteItems(),
				fnAttachmentExistCheck = function (oAttachment) {
					if (!bIsReplaced && oAttachment.getProperty("fileName") === oNewFile.name) {
						MessageBox.warning(this.getResourceBundle().getText("duplicateAttachment"));
						bIsReplaced = true;
						return;
					}
				}.bind(this);

			this._oItemToRemove = oItem;

			//Validate whether attachment already exists
			aUploadedAttachments.forEach(fnAttachmentExistCheck);
			if (bIsReplaced) {
				return;
			}
			aPendingUploads.forEach(fnAttachmentExistCheck);
			if (bIsReplaced) {
				return;
			}

			this._oItemToRemove = null;
		},

		onAfterAttachmentItemAdded: function (oEvent) {
			if (this._oItemToRemove) {
				this.oUploadSet.removeIncompleteItem(this._oItemToRemove);
				this._oItemToRemove = null;
			}
			//inform user about maximum of 5 attachments
			var aAllItems = oEvent.getSource().getItems().concat(oEvent.getSource().getIncompleteItems());
			if (aAllItems.length === I_MAX_ATTACHMENTS) {
				MessageToast.show(this.getResourceBundle().getText("maxAttachment"));
			}
		},

		//Allow only one new attachment per save operation		
		onAttachmentChange: function (oEvent) {
			var bIsReplaced = false,
				aAttachments = this.oUploadCollection.getItems(),
				firstItem = aAttachments[0],
				oNewFile = oEvent.getParameter("files")[0];

			this._oNewFileData[oNewFile.name] = oNewFile;

			//Validate whether attachment exist already
			aAttachments.forEach(function (oAttachment) {
				if (oAttachment.getProperty("fileName") === oNewFile.name) {
					MessageBox.warning(this.getResourceBundle().getText("duplicateAttachment"), {
						onClose: function () {
							this.oUploadCollection.removeItem(oAttachment);
						}.bind(this)
					});
					bIsReplaced = true;
					return;
				}
			}.bind(this));

			if (!bIsReplaced) {
				//inform user about maximum of 5 attachments
				if (aAttachments.length === I_MAX_ATTACHMENTS - 1) {
					MessageToast.show(this.getResourceBundle().getText("maxAttachment"));
				} else {
					var aAttachmentForUpload = this.oUploadCollection._aFileUploadersForPendingUpload;
					//Check whether we have one new attachment already in the queue
					//If yes - replace the previous one and provide the description text		
					if (aAttachmentForUpload.length >= 1 && firstItem && firstItem._status !== "display") {
						MessageBox.warning(this.getResourceBundle().getText("oneAttachmentAllowed"), {
							onClose: function () {
								this.oUploadCollection.removeItem(firstItem);
							}.bind(this)
						});
					}
				}
			}
		},

		onBeforeUploadStarts: function (oEvent) {
			var oEventParameters = oEvent.getParameters(),
				sEncodedFileName = jQuery.sap.encodeURL(oEvent.getParameter("fileName"));

			// Header Slug
			oEventParameters.addHeaderParameter(new UploadCollectionParameter({
				name: "slug",
				value: sEncodedFileName
			}));
			// X-CSRF-Token
			oEventParameters.addHeaderParameter(new UploadCollectionParameter({
				name: "x-csrf-token",
				value: this.oODataModel.getSecurityToken()
			}));
			//Content-Disposition header
			oEventParameters.addHeaderParameter(new UploadCollectionParameter({
				name: "Content-Disposition",
				value: "attachment;filename=" + sEncodedFileName
			}));
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

		handleApproverDialogSearch: function (oEvent) {
			var sSearchText = oEvent.getParameter("value");

			oEvent.getSource().removeAllItems();
			oEvent.getSource().bindAggregation("items", {
				path: "/SearchApproverSet",
				filters: this._getApproverSearchFilters(),
				parameters: {
					custom: sSearchText ? {
						search: encodeURIComponent(sSearchText)
					} : {}
				},
				template: this._oSearchApproverItemTemplate
			});
		},

		/**
		 * Handles closed approvers dialog.
		 * @param {object} oEvent
		 *   Event triggered when the approver dialog is closed.
		 */
		handleApproverDialogClose: function (oEvent) {
			var oSelectedItem = oEvent.getParameter("selectedItem");
			if (oSelectedItem) {
				var oApproverInput = oEvent.getSource().data("initiator"),
					sApproverLevel = oEvent.getSource().data("approverLevel"),
					sPath = this.getView().getBindingContext().getPath() + "/ApproverLvl" + sApproverLevel;

				oApproverInput.setValue(oSelectedItem.getTitle());
				this.oODataModel.setProperty(sPath + "/Pernr", oSelectedItem.data("ApproverEmployeeID"));
			}
			oEvent.getSource().removeAllItems();
		},

		handleApproverDialogCancel: function (oEvent) {
			oEvent.getSource().removeAllItems();
		},

		handleSearchHelperDialogSearch: function (oEvent) {
			var oBinding,
				sSearchText,
				oDialogInitiatorControl;

			oDialogInitiatorControl = oEvent.getSource().data("initiator");
			sSearchText = oEvent.getParameter("value");

			// Create filter fields as specified in the view
			var oFilter = new Filter({
				filters: oDialogInitiatorControl.data("helperCollectionFilterFields")
					.split(",")
					.map(function (sFilterField) {
						return new Filter(
							sFilterField,
							FilterOperator.Contains,
							sSearchText
						);
					}),
				and: false // or logic
			});

			oBinding = oEvent.getSource().getBinding("items");
			oBinding.filter([oFilter]);
		},

		handleSearchHelperDialogClose: function (oEvent) {
			var sSelectedItemValue,
				oInitiatorControl,
				oSelectedItem = oEvent.getParameter("selectedItem");

			if (!oSelectedItem) {
				return;
			}
			oInitiatorControl = oEvent.getSource().data("initiator");

			sSelectedItemValue = oSelectedItem.getProperty("title") === "(space)" ? "" : oSelectedItem.getProperty("title");

			// Save value back into original model
			var sCurrentAdditionalFieldPath = oInitiatorControl.getBindingContext("create").getPath();
			this.oCreateModel.setProperty(
				sCurrentAdditionalFieldPath + "/fieldValue",
				sSelectedItemValue
			);

			var sDescription = oSelectedItem.getProperty("description");
			this.oCreateModel.setProperty(
				sCurrentAdditionalFieldPath + "/descriptionText",
				sDescription
			);

			this._checkRequiredField(oInitiatorControl);

			// revalidate save button state
			this._revalidateSaveButtonStatus();
		},

		onSearchHelperRequest: function (oEvent) {
			var oSourceControl = oEvent.getSource();
			var sInitialSearchText = oSourceControl.getValue();

			if (!this._oSearchHelperDialog) {
				var oDialogController = {
					handleSearch: this.handleSearchHelperDialogSearch.bind(this),
					handleClose: this.handleSearchHelperDialogClose.bind(this)
				};
				this._oSearchHelperDialog = utils.setResizableDraggableForDialog(sap.ui.xmlfragment(
					"hcm.fab.myleaverequest.view.fragments.SearchHelperDialog",
					oDialogController
				));
			}

			this.getSearchHelperDialogModel(
				oSourceControl.data("helperTitleText"),
				oSourceControl.data("helperNoDataFoundText"),
				oSourceControl.data("helperCollection"),
				oSourceControl.data("helperCollectionTitleField"),
				oSourceControl.data("helperCollectionDescriptionField")
			).then(function (oModel) {
				this._oSearchHelperDialog.setModel(oModel);
				this._oSearchHelperDialog.data("initiator", oSourceControl);

				this.handleSearchHelperDialogSearch(new Event("initSearch", this._oSearchHelperDialog, {
					value: sInitialSearchText
				}));
				this._oSearchHelperDialog.open(sInitialSearchText);
			}.bind(this));
		},

		onNavBack: function () {
			//check for model changes and ask for cancel confirmation
			this._confirmCancel();
		},

		getSelectedAbsenceTypeControl: function () {
			return this.getView().byId("absenceType").getSelectedItem();
		},

		getSearchHelperDialogModel: function (sDialogTitle, sDialogNoResultText, sCollectionName, sTitleField, sDescriptionField) {
			return new Promise(function (fnResolve, fnReject) {
				// retrieve data from model
				var sCountryGrouping = this.getModel("global").getProperty("/sCountryGrouping");
				this.oODataModel.read("/" + sCollectionName, {
					filters: (sCollectionName === "SearchWageTypeSet" && sCountryGrouping) ? [new Filter("CountryGrouping", FilterOperator.EQ,
						sCountryGrouping)] : [],
					success: function (oCollection) {
						if (!oCollection.hasOwnProperty("results")) {
							fnReject("Cannot find 'results' member in the " + sCollectionName + " collection");
							return;
						}
						var oFragmentModel = {
							DialogTitle: sDialogTitle,
							NoDataText: sDialogNoResultText,
							Collection: []
						};
						oFragmentModel.Collection = oCollection.results.map(function (oCollectionItem) {
							// fields for filtering
							var oCollectionItemClone = jQuery.extend({}, oCollectionItem, true);

							// fields for rendering 
							oCollectionItemClone.Title = oCollectionItem[sTitleField] === "" ? "(space)" : oCollectionItem[sTitleField];
							oCollectionItemClone.Description = oCollectionItem[sDescriptionField];

							return oCollectionItemClone;
						});

						fnResolve(new JSONModel(oFragmentModel));
					},
					error: function (oError) {
						fnReject(oError);
					}
				});
			}.bind(this));
		},

		/**
		 * Sets a group of properties into the given model.
		 *
		 * @param {object} oModel
		 *   A model object
		 * @param {object} oProperties
		 *   An object indicating properties to set in the model and their
		 *   respective values.
		 * @param {string} [sPathPrefix]
		 *   The prefix for the model path. If given, the properties are stored
		 *   under this path. Otherwise they are stored at the model root level
		 *   "/".
		 * @param {boolean} [bUpdateView]
		 *   Whether the view should be updated once all properties have been
		 *   set. Defaults to true.
		 */
		setModelProperties: function (oModel, oProperties, sPathPrefix, bUpdateView) {
			var aProperties = Object.keys(oProperties);
			var iPropertyCount = aProperties.length;
			aProperties.forEach(function (sProperty, iIdx) {
				var bAsyncModelUpdate = true;
				var sPropertyPath = (sPathPrefix || "") + "/" + sProperty;

				// force model update when the last property is set
				if (iIdx === iPropertyCount - 1 && bUpdateView) {
					bAsyncModelUpdate = false;
				}
				oModel.setProperty(sPropertyPath, oProperties[sProperty], bAsyncModelUpdate /* don't update view */ );
			});
		},

		updateOdataModel: function (oAbsenceTypeData, oRouteArgs) {
			var oNewProperties = {
					"EmployeeID": oAbsenceTypeData.EmployeeID,
					"AbsenceTypeName": oAbsenceTypeData.AbsenceTypeName,
					"AbsenceTypeCode": oRouteArgs.absenceType && oRouteArgs.absenceType !== "default" ? oRouteArgs.absenceType : oAbsenceTypeData.AbsenceTypeCode
				},
				oDateFrom = oRouteArgs.dateFrom ? new Date(parseInt(oRouteArgs.dateFrom, 10)) : null,
				oDateTo = oRouteArgs.dateTo ? new Date(parseInt(oRouteArgs.dateTo, 10)) : null,
				sPath = this.getView().getBindingContext().getPath();

			if (this.oCreateModel.getProperty("/bUseDateDefaults")) {
				//absence type defaults are only considered if no dates were passed via URL parameter and in CREATE mode
				oDateFrom = oDateFrom || oAbsenceTypeData.DefaultStartDate;
				oDateTo = oDateTo || oAbsenceTypeData.DefaultEndDate;
			}

			if (!oAbsenceTypeData.IsAllowedDurationMultipleDay) {
				oDateTo = this.oCreateModel.getProperty("/oLeaveStartDate") || oDateFrom;
			}

			if (oDateFrom) {
				oNewProperties.StartDate = oDateFrom;
			}

			if (oDateTo) {
				oNewProperties.EndDate = oDateTo;
			}

			this.setModelProperties(
				this.oODataModel,
				oNewProperties,
				sPath,
				false /* update view */
			);
		},

		onOverlapOpen: function () {
			if (!this._overlapDialog) {
				this.getView().removeDependent(this._oOverlapCalendar);

				this._overlapDialog = new Dialog({
					title: "{i18n>overlapCalendarLabel}",
					contentWidth: "80rem",
					contentHeight: "44rem",
					draggable: true,
					resizable: true,
					stretch: Device.system.phone,
					content: [
						this._oOverlapCalendar
					],
					beginButton: [
						new Button({
							text: "{i18n>calendarOverlapCloseButtonText}",
							tooltip: "{i18n>calendarOverlapCloseButtonText}",
							press: function () {
								this._overlapDialog.close();
								this.oCreateModel.setProperty("/calendar/opened", false);
							}.bind(this)
						})
					]
				});
				this.getView().addDependent(this._overlapDialog);
			}
			this.oCreateModel.setProperty("/calendar/opened", true);
			this._overlapDialog.open();
		},

		onCalendarNavigate: function (oEvent) {
			var oDataPicker = oEvent.getSource(),
				oStartDate = oEvent.getParameter("dateRange").getStartDate(),
				oEndDate = oEvent.getParameter("dateRange").getEndDate();

			// workaround: datepicker might show a few days of the previous month / next month
			if (oStartDate.getDate() > 20) { // set to start of next month
				oStartDate.setDate(1); // first reset the day, else "31th april" + "1 month will" be "1st may"
				oStartDate.setMonth(oStartDate.getMonth() + 1);
			}
			if (oEndDate.getDate() < 10) { // set to end of previous month
				oEndDate.setDate(0);
			}

			// workaround: try to configure popup calendar (remove fixed weekends etc)
			CalendarUtil.configureCalendar(oEvent.getSource()._oCalendar, this.getModel(), this.getResourceBundle());

			oDataPicker.setBusy(true);
			oDataPicker.removeAllSpecialDates();
			this._oDataUtil.getCalendarEvents(oStartDate, oEndDate).then(function (oResult) {
				oDataPicker.setBusy(false);
				CalendarUtil.fillCalendarWithLeaves(oDataPicker, oResult.leaveRequests, oStartDate, oEndDate);
				CalendarUtil.fillCalendarFromEmployeeCalendar(oDataPicker, oResult.workSchedule);
			});
		},

		/* =========================================================== */
		/* internal methods                                            */
		/* =========================================================== */

		/**
		 * Navigates back in the browser history, if the entry was created by this app.
		 * If not, it navigates to the Details page
		 * @private
		 */
		_navBack: function () {
			this.oErrorHandler.setShowErrors("immediately");
			this.oErrorHandler.clearErrors();
			this.getView().unbindElement();
			this.getView().setBindingContext(null);
			this.initLocalModel();
			this._doAttachmentCleanup();

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

		_confirmCancel: function () {
			var oComponent = this.getOwnerComponent();
			// check if the model has been changed
			if (this._hasPendingChanges()) {
				// get user confirmation first			
				MessageBox.confirm(this.getResourceBundle().getText("cancelPopover"), {
					styleClass: oComponent.getContentDensityClass(),
					initialFocus: MessageBox.Action.CANCEL,
					onClose: function (oAction) {
						if (oAction === MessageBox.Action.OK) {
							this._cleanupUnsubmittedViewChanges();
							this._navBack();
						}
					}.bind(this)
				});
			} else {
				// cancel without confirmation
				this._navBack();
			}
		},

		_updateChangeRelevantLocalModelProperty: function (sPropertyName, sPropertyValue) {
			LOCAL_MODEL_CHANGE_RELEVANT_PROPERTY_LIST.forEach(function (oProperty) {
				if (oProperty === sPropertyName) {
					this._oLocalModelProperties[oProperty] = JSON.stringify(sPropertyValue);
				}
			}.bind(this));
		},

		/* Copies the current values of all properties marked as "change relvant" from the local model and
		 * check against these in the _hasPendingChanges function. */
		_rememberChangeRelevantLocalModelProperties: function () {
			this._oLocalModelProperties = {};
			LOCAL_MODEL_CHANGE_RELEVANT_PROPERTY_LIST.forEach(function (oProperty) {
				var p = this.oCreateModel.getProperty("/" + oProperty);
				this._oLocalModelProperties[oProperty] = JSON.stringify(p);
			}.bind(this));

			// special handling attachments, remember them aswell
			var items = this._getAttachmentItemList();
			this._oLocalModelProperties.AttachmentList = JSON.stringify(items);
		},

		/* Checks against pending changes in both the local and in the odata model. */
		_hasPendingChanges: function () {
			// check odate model first (since it is faster?)
			if (this.oODataModel.hasPendingChanges())
				return true;

			// only check properties if we already have some stored
			if (!this._oLocalModelProperties)
				return false;

			// check local model for changes
			for (var i = 0; i < LOCAL_MODEL_CHANGE_RELEVANT_PROPERTY_LIST.length; i++) {
				var propertyName = LOCAL_MODEL_CHANGE_RELEVANT_PROPERTY_LIST[i];
				var v2 = JSON.stringify(this.oCreateModel.getProperty("/" + propertyName));
				if (this._oLocalModelProperties[propertyName] !== v2)
					return true;
			}

			// check attachments against control directly (their are in neither model)
			var items = this._getAttachmentItemList();
			if (this._oLocalModelProperties.AttachmentList !== JSON.stringify(items))
				return true;

			return false;
		},

		/* Update the saveButtonEnabled property in the local model. */
		_revalidateSaveButtonStatus: function () {
			// check for required fields to have values
			var oLeaveRequest = this.getView().getBindingContext().getObject();
			if (!oLeaveRequest || !oLeaveRequest.AbsenceTypeCode || !oLeaveRequest.StartDate) {
				this.oCreateModel.setProperty("/saveButtonEnabled", false);
				return;
			}

			// leave request in status rejected are always submittable
			if (oLeaveRequest.StatusID === "REJECTED" || this.oCreateModel.getProperty("/sEditMode") === "DELETE") {
				this.oCreateModel.setProperty("/saveButtonEnabled", true);
				return;
			}

			// check for changes from the user
			this.oCreateModel.setProperty("/saveButtonEnabled", this._hasPendingChanges());
		},

		/*
		 * This is the handler called when the route is matched. This handler
		 * is called before any events are triggered by the view (e.g.,
		 * onAbsenceTypeReceived).
		 */
		_onCreateRouteMatched: function (oEvent) {
			var oRouteArgs = oEvent.getParameter("arguments"),
				oAssignmentPromise = this.getOwnerComponent().getAssignmentPromise();

			this.oErrorHandler.setShowErrors("immediately");
			this.oErrorHandler.clearErrors();
			this.oCreateModel.setProperty("/sEditMode", "CREATE");
			this.oCreateModel.setProperty("/bUseDateDefaults", !oRouteArgs.dateFrom && !oRouteArgs.dateTo);
			this._notesBuffer = "";

			//
			// Actions that don't depend on all the absence type being
			// retrieved below...
			//
			this._destroyAdditionalFields();
			this._cleanupUnsubmittedViewChanges();

			this.oCreateModel.setProperty("/viewTitle", this.getResourceBundle().getText("createViewTitle"));

			Promise.all([
				this.oODataModel.metadataLoaded(),
				oAssignmentPromise,
				this.oODataModel.getMetaModel().loaded()
			]).then(function (aPromiseResults) {
				this._absenceTypeReceivedDeferred = utils.createDeferred();

				// update binding
				this.sCEEmployeeId = aPromiseResults[1];
				this._oSelectionItemTemplate = this.getView().byId("selectionTypeItem");
				this.oCreateModel.setProperty("/busy", true);

				this.getView().byId("absenceType").bindItems({
					path: "/AbsenceTypeSet",
					template: this._oSelectionItemTemplate,
					filters: [new Filter("EmployeeID", FilterOperator.EQ, this.sCEEmployeeId)],
					parameters: {
						expand: "toAdditionalFieldsDefinition,toApprover"
					},
					events: {
						dataReceived: this.onAbsenceTypeReceived.bind(this)
					}
				});

				// Initialize data utility class
				this._oDataUtil = DataUtil.getInstance(this.sCEEmployeeId, this.getModel());

				// Initialize overlap calendar
				this._initOverlapCalendar();

				this._absenceTypeReceivedDeferred.promise.then(function (oAbsenceTypeResult) {
					var oViewBindingContext = this.createLeaveRequestCollection(), // Create a new entry and prepare to edit it
						sBindingPath = oViewBindingContext.getPath(),
						aDefaultAbsenceTypes = oAbsenceTypeResult.filter(function (oAbsenceType) {
							if (oRouteArgs.absenceType && oRouteArgs.absenceType !== "default") {
								return oAbsenceType.AbsenceTypeCode === oRouteArgs.absenceType;
							} else {
								return oAbsenceType.DefaultType;
							}
						}),
						// get default absence type code
						oSelectedAbsenceType = aDefaultAbsenceTypes.length !== 0 ? aDefaultAbsenceTypes[0] : oAbsenceTypeResult[0].AbsenceTypeCode;

					this.getView().setBindingContext(oViewBindingContext);
					this.updateOdataModel(oSelectedAbsenceType, oRouteArgs);

					var oAbsenceTypeData = jQuery.extend(true, {}, oSelectedAbsenceType),
						oAbsenceTypeControlContext = this.getSelectedAbsenceTypeControl().getBindingContext(),
						oAdditionalFieldsDefinitions = oAbsenceTypeControlContext.getProperty("toAdditionalFieldsDefinition") || [],
						oAdditionalFieldsValues = this._getAdditionalFieldValues(
							oAdditionalFieldsDefinitions, {} /* non-default values to display */
						),
						oAdditionalFields = {
							definition: oAdditionalFieldsDefinitions,
							values: oAdditionalFieldsValues
						};

					this._handleApprovers(
						sBindingPath,
						oSelectedAbsenceType.toApprover.results
					);

					this._updateLocalModel(
						oAdditionalFields,
						oAbsenceTypeData,
						this.oODataModel.getProperty(sBindingPath + "/StartDate"),
						this.oODataModel.getProperty(sBindingPath + "/EndDate")
					);

					this._handleAttachments(oAbsenceTypeData);

					this._fillAdditionalFields(
						this.oCreateModel,
						oAbsenceTypeData.AbsenceTypeCode,
						this._getAdditionalFieldsContainer()
					);

					this._fillAdditionalFieldTexts(oAdditionalFieldsDefinitions, oAdditionalFieldsValues);

					// calculate potentially used time
					this._updateCalcLeaveDays(false);
					// Done
					this.oCreateModel.setProperty("/busy", false);

					// initialization complete, remember state of local model
					this._rememberChangeRelevantLocalModelProperties();
					// and set SAVE button state accordingly
					this._revalidateSaveButtonStatus();
				}.bind(this));
			}.bind(this));
		},

		_onDeletePostedLeaveRouteMatched: function (oEvent) {
			this.oCreateModel.setProperty("/sEditMode", "DELETE");
			this._onEditRouteMatchedInternal(oEvent);
		},

		_onEditRouteMatched: function (oEvent) {
			this.oCreateModel.setProperty("/sEditMode", "EDIT");
			this._onEditRouteMatchedInternal(oEvent);
		},

		_onEditRouteMatchedInternal: function (oEvent) {
			var oRouteArgs = oEvent.getParameter("arguments"),
				sLeaveRequestId = "/" + oRouteArgs.leavePath,
				oAssignmentPromise = this.getOwnerComponent().getAssignmentPromise(),
				oView = this.getView();

			this.oErrorHandler.setShowErrors("immediately");
			this.oErrorHandler.clearErrors();
			this._destroyAdditionalFields();

			this.oCreateModel.setProperty("/bUseDateDefaults", false);
			this.oCreateModel.setProperty("/viewTitle", this.getResourceBundle().getText(this.oCreateModel.getProperty("/sEditMode") ===
				"DELETE" ? "deleteLeaveRequest" : "editViewTitle"));

			this._cleanupUnsubmittedViewChanges();

			this.oCreateModel.setProperty("/busy", true);

			Promise.all([
				this.oODataModel.metadataLoaded(),
				oAssignmentPromise,
				this.oODataModel.getMetaModel().loaded()
			]).then(function (aPromiseResults) {
				// did the assignment change?
				if (this.sCEEmployeeId !== aPromiseResults[1]) {
					this._absenceTypeReceivedDeferred = utils.createDeferred();

					// update binding
					this.sCEEmployeeId = aPromiseResults[1];
					this._oSelectionItemTemplate = oView.byId("selectionTypeItem");
					oView.byId("absenceType").bindItems({
						path: "/AbsenceTypeSet",
						template: this._oSelectionItemTemplate,
						filters: [new Filter("EmployeeID", FilterOperator.EQ, this.sCEEmployeeId)],
						parameters: {
							expand: "toAdditionalFieldsDefinition,toApprover"
						},
						events: {
							dataReceived: this.onAbsenceTypeReceived.bind(this)
						}
					});
				}

				// Initialize data utility class
				this._oDataUtil = DataUtil.getInstance(this.sCEEmployeeId, this.getModel());

				// Initialize overlap calendar
				this._initOverlapCalendar();

				// Wait for data in the dropdown to be populated
				this._absenceTypeReceivedDeferred.promise.then(function (aAbsenceTypes) {
					var oLeaveRequest = oView.getModel().getProperty(sLeaveRequestId),
						fnHandleEditLeave = function (oLeaveRequestToEdit) {
							//data could be retrieved from the backend
							var oSelectedAbsenceTypeControl = this.getSelectedAbsenceTypeControl();

							//transform notes (temporary solution!)
							this._notesBuffer = oLeaveRequestToEdit.Notes;
							var aNotes = this.formatter.formatNotes(this._notesBuffer);

							this._oNotesModel.setProperty("/NoteCollection", aNotes);

							// The oLeaveRequestToEdit is an instance of
							// LeaveRequestCollection. There are some information
							// that we still need to borrow from the current request
							// type before updating the local model.
							var oAbsenceTypeContext = oSelectedAbsenceTypeControl.getBindingContext(),
								oSelectedAbsenceType = oAbsenceTypeContext.getObject(),
								oAdditionalFieldsDefinitions = oAbsenceTypeContext.getProperty("toAdditionalFieldsDefinition"),
								oAdditionalFieldsValues = this._getAdditionalFieldValues(
									oAdditionalFieldsDefinitions,
									oLeaveRequestToEdit.AdditionalFields /* display these values */
								),
								oAdditionalFields = {
									definition: oAdditionalFieldsDefinitions,
									values: oAdditionalFieldsValues
								};

							//get current approver level
							var aEditApprovers = Array.apply(null, {
								length: I_MAX_APPROVERS
							}).map(function (oUndefined, iIdx) {
								return oLeaveRequestToEdit["ApproverLvl" + (iIdx + 1)];
							}).filter(function (oApproverData) {
								return oApproverData && oApproverData.Pernr !== "00000000";
							});
							this.oCreateModel.setProperty("/iCurrentApproverLevel", aEditApprovers.length);
							this.oCreateModel.setProperty("/aProposedApprovers", aEditApprovers);

							this._updateLocalModel(
								oAdditionalFields,
								oAbsenceTypeContext.getObject(),
								oLeaveRequestToEdit.StartDate,
								oLeaveRequestToEdit.EndDate
							);

							this._handleAttachments(oAbsenceTypeContext.getObject(), oLeaveRequestToEdit);

							this._fillAdditionalFields(
								this.oCreateModel,
								oSelectedAbsenceType.AbsenceTypeCode,
								this._getAdditionalFieldsContainer()
							);

							this._fillAdditionalFieldTexts(oAdditionalFieldsDefinitions, oAdditionalFieldsValues);

							this._updateCalcLeaveDays(false);

							this.oCreateModel.setProperty("/busy", false);
							this.oErrorHandler.setShowErrors("immediately");

							// initialization complete, remember state of local model
							this._rememberChangeRelevantLocalModelProperties();
							// and set SAVE button state accordingly
							this._revalidateSaveButtonStatus();
						}.bind(this);

					if (!oLeaveRequest || oLeaveRequest.hasOwnProperty("ReqOrInfty")) {
						//data is not yet present in the ODATA-model or backend is updated as per SAP-note 2989229
						this.oErrorHandler.setShowErrors("manual");
						oView.bindElement({
							path: sLeaveRequestId,
							events: {
								change: function (oEvent) {
									// No data for the binding
									if (!oView.getElementBinding().getBoundContext()) {
										setTimeout(function () { //wait for event "attachRequestFailed" to collect error messages in ErrorHandler.js
											this.oErrorHandler.displayErrorPopup(function () {
												utils.navTo.call(this, "overview", true /* bReplace */ );
												this.oCreateModel.setProperty("/busy", false);
												this.oErrorHandler.setShowErrors("immediately");
											}.bind(this));
										}.bind(this), 0);
										return;
									}

									var oLeaveRequestToEdit = oView.getBindingContext().getObject();
									if (oLeaveRequestToEdit) {
										fnHandleEditLeave(oLeaveRequestToEdit);
									}
								}.bind(this)
							}
						});

					} else {
						//data is already present in the ODATA-model
						oView.setBindingContext(new sap.ui.model.Context(oView.getModel(), sLeaveRequestId));

						fnHandleEditLeave(oLeaveRequest);
					}
				}.bind(this));
			}.bind(this));
		},

		_destroyAdditionalFields: function () {
			Object.keys(this._oAdditionalFieldsControls).forEach(function (sFieldName) {
				var aControls = this._oAdditionalFieldsControls[sFieldName];
				aControls.forEach(function (oControl, iIndex) {
					oControl.destroy();
					if (iIndex > 0) {
						delete this._oAdditionalFieldsControls[sFieldName];
					}
				}.bind(this));
			}.bind(this));
		},

		_getAdditionalFieldsContainer: function () {
			return this.getView().byId("additionalFieldsSimpleForm");
		},

		_getAdditionalFieldFragmentName: function (oAdditionalField, sBindingPath) {
			var sFragmentName = "";
			switch (oAdditionalField.Type_Kind) {
			case "C":
				sFragmentName = "AdditionalFieldInput";

				var vFieldValue = this.oODataModel.getProperty(sBindingPath + "/AdditionalFields/" + oAdditionalField.Fieldname);
				if (typeof vFieldValue === "boolean" || this._isFieldShownAsCheckbox(oAdditionalField)) {
					sFragmentName = "AdditionalFieldCheckbox";
				} else if (oAdditionalField.HasF4) {
					sFragmentName = "AdditionalFieldSearchHelperInput";
				}
				break;

			case "P":
				sFragmentName = null;
				break;

			case "N":
				sFragmentName = "AdditionalFieldInputInteger";
				break;

			case "D":
				sFragmentName = "AdditionalFieldDatePicker";
				break;

			case "T":
				sFragmentName = "AdditionalFieldTimePicker";
				break;

			default:
				sFragmentName = "AdditionalFieldInput";
			}

			return sFragmentName;
		},

		_callCalcLeaveDaysFunctionImport: function (oParams) {
			return new Promise(function (fnResolve, fnReject) {
				this.oODataModel.callFunction("/CalculateLeaveSpan", {
					method: "GET",
					groupId: "leaveDuration",
					urlParameters: oParams,
					success: function (oResult) {
						fnResolve(oResult);
					},
					error: function (oError) {
						fnReject(oError);
					}
				});
			}.bind(this));
		},

		_callAvailableQuotaFunctionImport: function (oParams) {
			return new Promise(function (fnResolve, fnReject) {
				this.oODataModel.callFunction("/CalculateQuotaAvailable", {
					method: "GET",
					groupId: "quotaAvailability",
					urlParameters: oParams,
					success: function (oResult) {
						fnResolve(oResult);
					},
					error: function (oError) {
						fnReject(oError);
					}
				});
			}.bind(this));
		},

		_callGetMultiApproversFunctionImport: function (oParams) {
			return new Promise(function (fnResolve, fnReject) {
				this.oCreateModel.setProperty("/isLoadingApprovers", true);
				this.oODataModel.callFunction("/GetMultiLevelApprovers", {
					method: "GET",
					groupId: "getMultiApprovers",
					urlParameters: oParams,
					success: function (oResult) {
						fnResolve(oResult);
					},
					error: function (oError) {
						fnReject(oError);
					}
				});
			}.bind(this));
		},

		/**
		 * Cleans up any unsubmitted change to the view model.
		 *
		 * The following scenario can occur. User creates a new leave request.
		 * Starts filling it in. Then he/she clicks browser back button without
		 * submitting the leave request. If this cleanup is not made, a new
		 * binding path will be created and bound to the view model, and when
		 * submitting, also the previous (unfinished) request is submitted.
		 *
		 * This method is safe to call if there is no binding path.
		 */
		_cleanupUnsubmittedViewChanges: function () {
			var oContext = this.getView().getBindingContext();
			if (oContext) {
				if (this.oCreateModel.getProperty("/sEditMode") !== "CREATE") {
					if (this.oODataModel.hasPendingChanges()) {
						this.oODataModel.resetChanges([oContext.getPath()]);
					}
				} else if (oContext) {
					this.oODataModel.deleteCreatedEntry(oContext);
				}
			}
			this.getView().unbindElement();
		},

		//Update the calculation of potentially used days on basis of the UI input
		_updateCalcLeaveDays: function (bIsHourTriggered) {
			var sCurrentLeaveRequestPath = this.getView().getBindingContext().getPath(),
				sEditMode = this.oCreateModel.getProperty("/sEditMode"),
				oRangeStartDate = this.oODataModel.getProperty(sCurrentLeaveRequestPath + "/StartDate"),
				oRangeEndDate = this.oODataModel.getProperty(sCurrentLeaveRequestPath + "/EndDate"),
				sAbsenceType = this.oODataModel.getProperty(sCurrentLeaveRequestPath + "/AbsenceTypeCode"),
				oDateFormat = DateFormat.getDateTimeInstance({
					pattern: "yyyyMMdd",
					UTC: true //MELN2652941
				});

			if (!oRangeStartDate || !formatter.isGroupEnabled(oRangeStartDate, sAbsenceType)) {
				return;
			}

			var sDateStartFormatted = null;
			var sDateEndFormatted = null;

			if (this._bCheckLeaveSpanFIDateIsEdmTime) {
				sDateStartFormatted = oRangeStartDate;
				sDateEndFormatted = oRangeEndDate;
			} else {
				sDateStartFormatted = oDateFormat.format(oRangeStartDate);
				sDateEndFormatted = oDateFormat.format(oRangeEndDate);
			}

			this.oCreateModel.setProperty("/usedWorkingTime", this.getResourceBundle().getText("durationCalculation"));

			var sStartTime = null,
				sEndTime = null;
			//use Start/End-Time with default value if multidays are available
			if (this.oCreateModel.getProperty("/multiOrSingleDayRadioGroupIndex") === 0) {
				sStartTime = "";
				sEndTime = "";
			} else {
				//use Start/End-Time from the available model or (if initial) go with default value
				sStartTime = this.oODataModel.getProperty(sCurrentLeaveRequestPath + "/StartTime");
				if (!sStartTime) {
					sStartTime = "";
				}
				sEndTime = this.oODataModel.getProperty(sCurrentLeaveRequestPath + "/EndTime");
				if (!sEndTime) {
					sEndTime = "";
				}
			}

			var sInputHours = this.oODataModel.getProperty(sCurrentLeaveRequestPath + "/PlannedWorkingHours");
			//Check whether hours are within one calendar day 
			if (this.oCreateModel.getProperty("/multiOrSingleDayRadioGroupIndex") === 0 || !sInputHours || sInputHours <= 0 ||
				sInputHours > 24 || !bIsHourTriggered) {
				sInputHours = "0.0";
			}

			var sStatusId = this.oODataModel.getProperty(sCurrentLeaveRequestPath + "/StatusID");
			if (!sStatusId) {
				sStatusId = "";
			}

			this._callCalcLeaveDaysFunctionImport({
					AbsenceTypeCode: sAbsenceType,
					EmployeeID: this.oODataModel.getProperty(sCurrentLeaveRequestPath + "/EmployeeID"),
					InfoType: this.getSelectedAbsenceTypeControl().getBindingContext().getObject().InfoType,
					StartDate: sDateStartFormatted,
					EndDate: sDateEndFormatted,
					BeginTime: sStartTime,
					EndTime: sEndTime,
					RequestID: sEditMode !== "CREATE" ? this.oODataModel.getProperty(sCurrentLeaveRequestPath + "/RequestID") : "",
					InputHours: sInputHours,
					StatusID: sStatusId,
					LeaveKey: sEditMode !== "CREATE" ? this.oODataModel.getProperty(sCurrentLeaveRequestPath + "/LeaveKey") : ""
				})
				.then(function (oSuccess) {
						if (!oSuccess) {
							this.oCreateModel.setProperty("/usedWorkingTime", null);
							this._closeBusyDialog();
							return;
						}

						//if a save request is already on its way, we do not update the odata model
						//from the function import as this might lead to undefined odata model behaviour
						if (this.oCreateModel.getProperty("/isSaveRequestPending")) {
							return;
						}
						// Updated Addtional Fields
						var aAdditionalFields = this.oCreateModel.getProperty("/AdditionalFields"),
							bUpdateAdditionalFields = false;
						aAdditionalFields.forEach(function (AdditionalField) {
							switch (AdditionalField.Fieldname) {
							case "AttAbsDays":
								AdditionalField.fieldValue = oSuccess.CalculateLeaveSpan.AttAbsDays ? oSuccess.CalculateLeaveSpan.AttAbsDays :
									AdditionalField.fieldValue;
								bUpdateAdditionalFields = true;
								break;
							case "CaleDays":
								AdditionalField.fieldValue = oSuccess.CalculateLeaveSpan.CalendarDays ? oSuccess.CalculateLeaveSpan.CalendarDays :
									AdditionalField.fieldValue;
								bUpdateAdditionalFields = true;
								break;
							case "PayrDays":
								AdditionalField.fieldValue = oSuccess.CalculateLeaveSpan.QuotaUsed ? oSuccess.CalculateLeaveSpan.QuotaUsed :
									AdditionalField.fieldValue;
								bUpdateAdditionalFields = true;
								break;
							case "PayrHrs":
								AdditionalField.fieldValue = oSuccess.CalculateLeaveSpan.PayrollHours ? oSuccess.CalculateLeaveSpan.PayrollHours :
									AdditionalField.fieldValue;
								bUpdateAdditionalFields = true;
								break;
							default:
								break;
							}
						});
						if (bUpdateAdditionalFields) {
							this._updateChangeRelevantLocalModelProperty("AdditionalFields", aAdditionalFields);
							this.oCreateModel.setProperty("/AdditionalFields", aAdditionalFields);
						}
						//duration
						this.oCreateModel.setProperty("/usedWorkingTime", parseFloat(oSuccess.CalculateLeaveSpan.QuotaUsed));
						//time unit
						this.oCreateModel.setProperty("/usedWorkingTimeUnit", oSuccess.CalculateLeaveSpan.TimeUnitText);

						//Process hour based logic for start/end/hours value only in case of single day seletion
						if (this.oCreateModel.getProperty("/multiOrSingleDayRadioGroupIndex") === 1) {
							var inputHoursValue = 0;
							if (this.oCreateModel.getProperty("/showInputHours")) {
								if (this.getModel("global").getProperty("/bShowIndustryHours")) {
									inputHoursValue = this._getDecimalHoursFromInputControl();
								} else {
									inputHoursValue = this._getDecimalHoursFromTimepicker();
								}
							}
							// Manage setting of start/end time in case of input hours are entered
							if (bIsHourTriggered && inputHoursValue !== 0) {
								//Proceed only in case of visible start time picker
								if (this.byId("startTimePick").getVisible()) {
									if (oSuccess.CalculateLeaveSpan.BeginTime) {
										this.oODataModel.setProperty(sCurrentLeaveRequestPath + "/StartTime", oSuccess.CalculateLeaveSpan.BeginTime);
									} else {
										// Fallback: Set initial start time if no value came back
										this.oODataModel.setProperty(sCurrentLeaveRequestPath + "/StartTime", "");
									}
								}
								//Proceed only in case of visible end time picker
								if (this.byId("endTimePick").getVisible()) {
									if (oSuccess.CalculateLeaveSpan.EndTime) {
										this.oODataModel.setProperty(sCurrentLeaveRequestPath + "/EndTime", oSuccess.CalculateLeaveSpan.EndTime);
									} else {
										// Fallback: Set initial start time if no value came back
										this.oODataModel.setProperty(sCurrentLeaveRequestPath + "/EndTime", "");
									}
								}
							}
							//proceed only in case of visible hour field
							if (this.oCreateModel.getProperty("/showInputHours") && oSuccess.CalculateLeaveSpan.AttabsHours && oSuccess.CalculateLeaveSpan.AttabsHours !==
								"0.00" &&
								this.oODataModel.getProperty(sCurrentLeaveRequestPath + "/PlannedWorkingHours") !== oSuccess.CalculateLeaveSpan.AttabsHours) {
								this.oODataModel.setProperty(sCurrentLeaveRequestPath + "/PlannedWorkingHours", oSuccess.CalculateLeaveSpan.AttabsHours);
							}
						}

						this._closeBusyDialog();
					}.bind(this),

					function (oError) {
						this.oCreateModel.setProperty("/usedWorkingTime", null);
						this.oCreateModel.setProperty("/usedWorkingTimeUnit", null);

						this._closeBusyDialog();
					}.bind(this));
		},

		_updateAvailableQuota: function (oAbsenceTypeData, oStartDate, oEndDate) {
			var oParams = {
				AbsenceTypeCode: oAbsenceTypeData.AbsenceTypeCode,
				EmployeeID: oAbsenceTypeData.EmployeeID,
				InfoType: oAbsenceTypeData.InfoType
			};

			this.oCreateModel.setProperty("/BalanceAvailableQuantityText", this.getResourceBundle().getText("availabilityCalculation"));
			this._showBusyDialog();
			if (this._bQuotaAvailabilityFIHasDateParams && oStartDate && oEndDate) {
				//if available in the backend, add date fields (available with SAP-note 2989229 in the backend)
				oParams.StartDate = oStartDate;
				oParams.EndDate = oEndDate;
			}

			return this._callAvailableQuotaFunctionImport(oParams).then(function (oAvailableDays) {
					if (!oAvailableDays) {
						this.oCreateModel.setProperty("/BalanceAvailableQuantityText", null);
					} else {
						//duration
						this.oCreateModel.setProperty("/BalanceAvailableQuantityText", parseFloat(oAvailableDays.CalculateQuotaAvailable.BalanceRestPostedRequested));
						//time unit
						this.oCreateModel.setProperty("/TimeUnitName", oAvailableDays.CalculateQuotaAvailable.TimeUnitText);
					}

					this._closeBusyDialog();
				}.bind(this),
				function (oError) {
					this.oCreateModel.setProperty("/BalanceAvailableQuantityText", null);

					this._closeBusyDialog();
				}.bind(this));
		},

		_updateApprovers: function (oAbsenceTypeData, oStartDate, oEndDate) {
			if (this.getModel("global").getProperty("/bReloadApproversUponDateChange") && oAbsenceTypeData.IsMultiLevelApproval) {
				var oParams = {
					AbsenceTypeCode: oAbsenceTypeData.AbsenceTypeCode,
					EmployeeID: oAbsenceTypeData.EmployeeID,
					Infotype: oAbsenceTypeData.InfoType,
					StartDate: oStartDate,
					EndDate: oEndDate
				};
				this._callGetMultiApproversFunctionImport(oParams).then(function (oMultiApprover) {
						this._handleApprovers(
							this.getView().getBindingContext().getPath(),
							oMultiApprover.results
						);

						this.oCreateModel.setProperty("/isLoadingApprovers", false);
						if (oMultiApprover.results.length > 0) {
							this.oCreateModel.setProperty("/isAddDeleteApproverAllowed", oMultiApprover.results[0].IsAddDele);
						}

					}.bind(this),
					function (oError) {
						this.oCreateModel.setProperty("/isLoadingApprovers", false);
					}.bind(this));
			}
		},

		//
		// Attachments ----------
		//
		_getAttachmentsUploadUrl: function (sPath) {
			return [
				this.oODataModel.sServiceUrl,
				sPath,
				"/toAttachments"
			].join("");
		},

		_updateUploadUrlsUploadCollection: function (aUploadCollectionItems, sUploadUrl) {
			//this is needed as the sap.m.UploadCollection does not allow the dynamic setting of the uploadUrl property
			//if pendingUpload is used
			var sFileUploadId = "",
				oFileUpload = {};

			aUploadCollectionItems.forEach(function (oUploadCollectionItem) {
				sFileUploadId = oUploadCollectionItem.getFileUploader();
				if (sFileUploadId) {
					oFileUpload = sap.ui.getCore().byId(sFileUploadId);
					oFileUpload.setUploadUrl(sUploadUrl);
				}
			}.bind(this));

			//again some nasty stuff due to error in sap.m.UploadCollection:
			//although the uploadUrl was changed for the FileUploader associated with the corresponding UploadCollectionItems,
			//the sap.m.UploadCollection uses an own private _oFileUploader property to update any drag and drop file
			//(and for this private property there is no standard means to set a dynamic uploadUrl)
			if (this.oUploadCollection.hasOwnProperty("_oFileUploader")) {
				this.oUploadCollection._oFileUploader.setUploadUrl(sUploadUrl);
			}
		},

		_getAttachmentsFromModel: function (oLeaveRequest) {
			return Array.apply(null, {
				length: I_MAX_ATTACHMENTS
			}).map(function (oUndefined, iIdx) {
				return oLeaveRequest["Attachment" + (iIdx + 1)];
			}).filter(function (oAttachment) {
				return oAttachment.FileName !== "";
			});
		},

		_getAttachmentItemList: function () {
			var aItems = [];
			if (this.oUploadCollection) {
				aItems = this.oUploadCollection.getItems().map(function (oAttachment) {
					return {
						id: oAttachment.getId(),
						fileName: oAttachment.getFileName(),
						mimeType: oAttachment.getMimeType(),
						uploadedDate: oAttachment.getUploadedDate(),
						url: oAttachment.getUrl()
					};
				});
			} else if (this.oUploadSet) {
				aItems = this.oUploadSet.getItems().concat(this.oUploadSet.getIncompleteItems());
				aItems = aItems.map(function (oAttachment) {
					return {
						id: oAttachment.getId(),
						fileName: oAttachment.getFileName(),
						url: oAttachment.getUrl()
					};
				});
			}
			return aItems;
		},

		_handleAttachments: function (oAbsenceTypeData, oLeaveRequest) {
			if (oAbsenceTypeData.AttachmentEnabled) {
				var aAttachments = [];
				if (oLeaveRequest) {
					aAttachments = this._getAttachmentsFromModel(oLeaveRequest);
				}
				this.oCreateModel.setProperty("/attachments", aAttachments);
				this.oCreateModel.setProperty("/isAttachmentUploadEnabled", aAttachments.length < I_MAX_ATTACHMENTS);

				//instantiate corresponding control
				if (sap.ui.getCore().getLoadedLibraries()["sap.m"].controls.indexOf("sap.m.upload.UploadSet") !== -1) {
					//UploadSet is available, use this control
					this._handleAttachmentsUploadSet(oAbsenceTypeData);
				} else {
					//we stick to control UploadCollection
					this._handleAttachmentsUploadCollection(oAbsenceTypeData);
				}
			} else {
				this._doAttachmentCleanup();
			}
		},

		_handleAttachmentsUploadSet: function (oAbsenceTypeData) {
			if (this.oUploadSet) {
				this.oUploadSet.setMaxFileSize(this._getMaxFileSizeFromAbsenceTypeInMB(oAbsenceTypeData));
				this.oUploadSet.setFileTypes(this._getSupportedFileTypeFromAbsenceType(oAbsenceTypeData));
			} else {
				this._oAttachmentsContainer.addItem(this._createNewUploadSetInstance(oAbsenceTypeData));
			}
		},

		_handleAttachmentsUploadCollection: function (oAbsenceTypeData) {
			if (this.oUploadCollection) {
				//check whether a new UploadCollection needs to be created
				if (this._isNewUploadCollectionInstanceNeeded(this.oUploadCollection, oAbsenceTypeData)) {
					//check if enduser needs to be informed that some attachments are lost
					if (this._informEnduserAboutLostAttachments()) {
						//-->> inform user that recently added items are lost and need to be re-attached	
						MessageBox.warning(this.getResourceBundle().getText("attachmentsLost"), {
							onClose: function () {
								//destroy old attachment collection
								this._doAttachmentCleanup();
								//and create a new one
								this._oAttachmentsContainer.addItem(this._createNewUploadCollectionInstance(oAbsenceTypeData));
							}.bind(this)
						});
					}
				}
			} else {
				this._oAttachmentsContainer.addItem(this._createNewUploadCollectionInstance(oAbsenceTypeData));
			}
		},

		_createNewUploadSetInstance: function (oAbsenceTypeData) {
			var oUploadSet = new sap.m.upload.UploadSet(
				"AttachmentCollection", {
					visible: true,
					fileTypes: this._getSupportedFileTypeFromAbsenceType(oAbsenceTypeData),
					maxFileSize: this._getMaxFileSizeFromAbsenceTypeInMB(oAbsenceTypeData),
					instantUpload: false,
					showIcons: true,
					terminationEnabled: false,
					uploadEnabled: {
						formatter: formatter.isAttachmentUploadEnabled,
						parts: ["StartDate", "AbsenceTypeCode", "create>/isAttachmentUploadEnabled"]
					},
					items: {
						path: "create>/attachments",
						templateShareable: false,
						template: new sap.m.upload.UploadSetItem({
							enabledEdit: true,
							enabledRemove: true,
							fileName: "{create>FileName}",
							url: {
								parts: ["EmployeeID", "RequestID", "create>ArchivDocId", "create>FileName"],
								formatter: formatter.formatAttachmentUrl
							},
							visibleEdit: false,
							visibleRemove: true,
							attributes: [
								new ObjectAttribute({
									title: "{i18n>attachmentUploadOnTxt}",
									text: {
										parts: ['create>CreaDate', 'create>CreaTime'],
										formatter: formatter.formatAttachmentTimeStamp
									}
								}),
								new ObjectAttribute({
									title: "{i18n>attachmentFileSizeTxt}",
									text: {
										path: "create>FileSize",
										formatter: formatter.formatFileSize
									}
								})
							]
						})
					},
					toolbar: new OverflowToolbar(
						"attachmentToolbar", {
							design: sap.m.ToolbarDesign.Transparent,
							content: [
								new Title({
									text: "{create>/sAttachmentsTitle}",
									level: "H2"
								}),
								new ToolbarSpacer()
							]
						}
					),
					beforeItemAdded: this.onBeforeAttachmentItemAdded.bind(this),
					afterItemAdded: this.onAfterAttachmentItemAdded.bind(this),
					fileSizeExceeded: this.onFileSizeExceeded.bind(this),
					fileTypeMismatch: this.onFileTypeMissmatch.bind(this),
					beforeUploadStarts: this.onBeforeUploadStartsSet.bind(this)
				}
			);

			oUploadSet.addEventDelegate({
				onAfterRendering: function (oEvent) {
					this._revalidateUploadButtonStatus();
					this._revalidateSaveButtonStatus();
				}.bind(this)
			});

			this.oUploadSet = oUploadSet;

			return oUploadSet;
		},

		_getSupportedFileTypeFromAbsenceType: function (oAbsenceTypeData) {
			return oAbsenceTypeData.AttachRestrictFileType ? oAbsenceTypeData.AttachSupportFileType.toLowerCase().split(',') : [];
		},

		_getMaxFileSizeFromAbsenceTypeInMB: function (oAbsenceTypeData) {
			//AttachMaxSize is KB from the backend; return value is in MB
			return oAbsenceTypeData.AttachMaxSize / 1024;
		},

		_getFileTypeFromFileName: function (sFileName) {
			return sFileName.substring(sFileName.lastIndexOf('.') + 1, sFileName.length) || sFileName;
		},

		_createNewUploadCollectionInstance: function (oAbsenceTypeData) {
			var oUploadCollection = new UploadCollection(
				"AttachmentCollection", {
					visible: true,
					fileType: this._getSupportedFileTypeFromAbsenceType(oAbsenceTypeData),
					maximumFileSize: this._getMaxFileSizeFromAbsenceTypeInMB(oAbsenceTypeData),
					multiple: false,
					sameFilenameAllowed: false,
					showSeparators: sap.m.ListSeparators.All,
					uploadEnabled: true,
					instantUpload: false,
					mode: sap.m.ListMode.None,
					uploadButtonInvisible: {
						formatter: formatter.isAttachmentUploadDisabled,
						parts: ["StartDate", "AbsenceTypeCode", "create>/isAttachmentUploadEnabled"]
					},
					terminationEnabled: false,
					items: {
						path: "create>/attachments",
						templateShareable: false,
						template: new UploadCollectionItem({
							fileName: "{create>FileName}",
							url: {
								parts: ["EmployeeID", "RequestID", "create>ArchivDocId", "create>FileName"],
								formatter: formatter.formatAttachmentUrl
							},
							visibleDelete: true,
							visibleEdit: false,
							attributes: [
								new ObjectAttribute({
									title: "{i18n>attachmentUploadOnTxt}",
									text: {
										parts: ['create>CreaDate', 'create>CreaTime'],
										formatter: formatter.formatAttachmentTimeStamp
									}
								}),
								new ObjectAttribute({
									title: "{i18n>attachmentFileSizeTxt}",
									text: {
										path: "create>FileSize",
										formatter: formatter.formatFileSize
									}
								})
							]
						})
					},
					infoToolbar: new OverflowToolbar(
						"attachmentToolbar", {
							visible: "{= !( ${create>/uploadPercentage} === 0 || ${create>/uploadPercentage} >= 100 ) }",
							design: sap.m.ToolbarDesign.Transparent,
							content: [
								new Label({
									text: "{i18n>txtUploading}"
								}),
								new ToolbarSpacer(),
								new ProgressIndicator({
									percentValue: "{create>/uploadPercentage}",
									showValue: false,
									state: "None"
								}).addStyleClass("sapUiSmallMarginBottom")
							]
						}
					),
					change: this.onAttachmentChange.bind(this),
					fileSizeExceed: this.onFileSizeExceeded.bind(this),
					typeMissmatch: this.onFileTypeMissmatch.bind(this),
					beforeUploadStarts: this.onBeforeUploadStarts.bind(this)
				}
			);

			oUploadCollection.addEventDelegate({
				onAfterRendering: function () {
					this._revalidateUploadButtonStatus();
					this._revalidateSaveButtonStatus();
				}.bind(this)
			});

			this.oUploadCollection = oUploadCollection;

			return oUploadCollection;
		},

		_isNewUploadCollectionInstanceNeeded: function (oUploadCollection, oAbsenceTypeData) {
			var aSupportedFileType = this._getSupportedFileTypeFromAbsenceType(oAbsenceTypeData),
				iMaxSize = this._getMaxFileSizeFromAbsenceTypeInMB(oAbsenceTypeData);
			return !(oUploadCollection && (oUploadCollection.getFileType()[0] !== aSupportedFileType[0] || oUploadCollection.getMaximumFileSize() !==
				iMaxSize));
		},

		_informEnduserAboutLostAttachments: function () {
			var aItems = this.oUploadCollection.getItems(),
				aItemsToUpload = [];
			if (aItems && aItems.length > 0) {
				//check for pending uploads
				aItemsToUpload = aItems.filter(function (oItem) {
					return oItem._status !== "display";
				});
				return aItemsToUpload.length > 0;
			}
			return false;
		},

		_revalidateUploadButtonStatus: function () {
			var aItems = [];
			if (this.oCreateModel.getProperty("/sEditMode") !== "CREATE") {
				aItems = this._getAttachmentsFromModel(this.getView().getBindingContext().getObject());
			}

			if (this.oUploadCollection) {
				var aUploadedAttachments = this.oUploadCollection.getItems().filter(function (oItem) {
					return !aItems.some(function (oModelAttachment) {
						return oModelAttachment.FileName === oItem.getProperty("fileName");
					});
				});
				aItems = aItems.concat(aUploadedAttachments);

			} else if (this.oUploadSet) {
				var aIncompleteItems = this.oUploadSet.getIncompleteItems(),
					aAllItems = this.oUploadSet.getItems().concat(aIncompleteItems);
				this.oCreateModel.setProperty("/sAttachmentsTitle", this.getResourceBundle().getText("attachmentToolbarTitle", [aAllItems.length]));

				aItems = aItems.concat(aIncompleteItems);
			}
			this.oCreateModel.setProperty("/isAttachmentUploadEnabled", aItems.length < I_MAX_ATTACHMENTS);
		},

		_handleApprovers: function (sPath, aApproverData) {
			var sBasePropertyPath = "",
				aApprovers = [];

			for (var i = 0; i < I_MAX_APPROVERS; i++) {
				sBasePropertyPath = sPath + "/ApproverLvl" + (i + 1);
				if (i < aApproverData.length) {
					aApprovers.push(aApproverData[i]);
					this.oODataModel.setProperty(sBasePropertyPath + "/Name", aApproverData[i].Name);
					this.oODataModel.setProperty(sBasePropertyPath + "/Pernr", aApproverData[i].Pernr);
					this.oODataModel.setProperty(sBasePropertyPath + "/Seqnr", aApproverData[i].Seqnr);
					this.oODataModel.setProperty(sBasePropertyPath + "/DefaultFlag", aApproverData[i].DefaultFlag);

				} else if (this.oODataModel.getProperty(sBasePropertyPath)) {
					this.oODataModel.setProperty(sBasePropertyPath, {
						Name: "",
						Pernr: "00000000",
						Seqnr: "000",
						DefaultFlag: false
					});
				}
			};

			this.oCreateModel.setProperty("/iCurrentApproverLevel", aApproverData.length);
			this.oCreateModel.setProperty("/aProposedApprovers", aApprovers);
		},

		// Returns the default value of a given additional field.
		_getAdditionalFieldDefaultValue: function (oAdditionalField) {
			var vDefault = "";

			switch (oAdditionalField.Type_Kind) {
			case "T":
				vDefault = null;
				break;
			case "D":
				vDefault = null;
				break;
			case "C":
				vDefault = this._isFieldShownAsCheckbox(oAdditionalField) ? false : "";
				break;
			default:
				/* N, P */
				vDefault = "";
			}

			return vDefault;
		},

		_fillAdditionalFieldTexts: function (oAdditionalFieldsDefinitions, oAdditionalFieldsValues) {
			oAdditionalFieldsDefinitions.forEach(function (sAdditionalFieldPath) {
				var vAdditionalFieldValue,
					oAdditionalField;

				oAdditionalField = this.oODataModel.getObject("/" + sAdditionalFieldPath);

				if (oAdditionalField.HasF4 && oAdditionalField.F4EntityName && oAdditionalFieldsValues.hasOwnProperty(oAdditionalField.Fieldname) &&
					(oAdditionalFieldsValues[oAdditionalField.Fieldname] || oAdditionalField.F4EntityName === "SearchOTCompensationTypeSet")) {
					vAdditionalFieldValue = oAdditionalFieldsValues[oAdditionalField.Fieldname];

					// fill key fields for the  relevant search help entity
					var oKeyProps = {},
						oEntitySetInfo = this.oODataModel.getMetaModel().getODataEntitySet(oAdditionalField.F4EntityName),
						aKeyProps = this.oODataModel.getMetaModel().getODataEntityType(oEntitySetInfo.entityType).key.propertyRef,
						sCountryGrouping = this.getModel("global").getProperty("/sCountryGrouping");

					//entity "SearchWageType" requires 'CountryGrouping' as filter value; so only call it if the info exists
					if ((oAdditionalField.F4EntityName === "SearchWageTypeSet" && sCountryGrouping) || oAdditionalField.F4EntityName !==
						"SearchWageTypeSet") {
						aKeyProps.forEach(function (sKeyProp) {
							oKeyProps[sKeyProp.name] = "";
							if (sKeyProp.name === oAdditionalField.F4KeyProperty) {
								oKeyProps[sKeyProp.name] = vAdditionalFieldValue;
							}

							if (sKeyProp.name === "CountryGrouping" && sCountryGrouping) {
								oKeyProps[sKeyProp.name] = sCountryGrouping;
							}
						}.bind(this));

						// finally, read the entity from the ODATA-service
						var sPath = this.oODataModel.createKey("/" + oAdditionalField.F4EntityName, oKeyProps),
							aAdditionalFieldsModel = this.oCreateModel.getProperty("/AdditionalFields");
						this.oODataModel.read(sPath, {
							success: function (oSuccess) {
								var bUpdateAdditionalFields = false;
								bUpdateAdditionalFields = aAdditionalFieldsModel.some(function (oEntry, i) {
									if (oEntry.Fieldname === oAdditionalField.Fieldname) {
										this.oCreateModel.setProperty("/AdditionalFields/" + i + "/descriptionText", oSuccess[oAdditionalField.F4DescriptionProperty]);
										oEntry.descriptionText = oSuccess[oAdditionalField.F4DescriptionProperty];
										return true;
									}
									return false;
								}.bind(this));
								if (bUpdateAdditionalFields) {
									this._updateChangeRelevantLocalModelProperty("AdditionalFields", aAdditionalFieldsModel);
								}

							}.bind(this),

							error: function (oError) {
								// text is not set in case of an error
							}
						});
					}
				}
			}.bind(this));
		},

		_getAdditionalFieldValues: function (oAdditionalFieldPaths, oValues) {
			var oAdditionalFieldValues = {};

			oAdditionalFieldPaths.forEach(function (sAdditionalFieldPath) {
				var vAdditionalFieldValue,
					oAdditionalField;

				oAdditionalField = this.oODataModel.getObject("/" + sAdditionalFieldPath);

				if (oValues.hasOwnProperty(oAdditionalField.Fieldname)) {
					if (oAdditionalField.Fieldname.startsWith("CUSTOMER")) {
						// convert as per field type
						switch (oAdditionalField.Type_Kind) {
						case "D":
							var oDateFormat = DateFormat.getDateInstance({
								pattern: "yyyyMMdd",
								UTC: true
							});
							vAdditionalFieldValue = oDateFormat.parse(oValues[oAdditionalField.Fieldname]);
							break;

						case "C":
							vAdditionalFieldValue = oValues[oAdditionalField.Fieldname];
							if (this._isCustomerAdditionalFieldCheckbox(oAdditionalField)) {
								vAdditionalFieldValue = vAdditionalFieldValue === 'X';
							}
							break;

						default:
							vAdditionalFieldValue = oValues[oAdditionalField.Fieldname];
						}
					} else {
						// use the value if we have it
						vAdditionalFieldValue = oValues[oAdditionalField.Fieldname];
					}
				} else {
					vAdditionalFieldValue = this._getAdditionalFieldDefaultValue(oAdditionalField);
				}
				oAdditionalFieldValues[oAdditionalField.Fieldname] = vAdditionalFieldValue;
			}.bind(this));

			return oAdditionalFieldValues;
		},

		_getCurrentAdditionalFieldValues: function () {
			// Current values are bound to local model
			var oCurrentValues = {};

			this.oCreateModel.getProperty("/AdditionalFields").forEach(function (oField) {
				oCurrentValues[oField.Fieldname] = oField.fieldValue;
			});

			return oCurrentValues;
		},

		_fillAdditionalFields: function (oModel, sAbsenceTypeCode, oContainer) {
			oContainer.removeAllContent();

			var sPath = this.getView().getBindingContext().getPath();

			oModel.getProperty("/AdditionalFields").forEach(function (oAdditionalField, iIdx) {
				var sFragmentName = this._getAdditionalFieldFragmentName(oAdditionalField, sPath);

				if (!this._oAdditionalFieldsControls[oAdditionalField.Fieldname]) {
					if (sFragmentName) {
						this._oAdditionalFieldsControls[oAdditionalField.Fieldname] = sap.ui.xmlfragment(
							this.getView().getId() + oAdditionalField.Fieldname,
							"hcm.fab.myleaverequest.view.fragments." + sFragmentName,
							this /* the fragment's controller */ );

					} else {
						this._addAdditionalFieldDecimal(this.getView(), oContainer, oModel, iIdx, this.onNumberChange, oAdditionalField, this._oAdditionalFieldsControls);
					}
				}

				this._oAdditionalFieldsControls[oAdditionalField.Fieldname].forEach(function (oControl) {
					// Bind to models
					// Set binding context first to avoid useless update when the
					// model is set...
					oControl.setBindingContext(
						oModel.createBindingContext("/AdditionalFields/" + iIdx),
						"create"
					);
					if (oAdditionalField.Required) {
						oControl.setFieldGroupIds("LeaveRequiredField");
					}
					this.getView().addDependent(oControl);
					oContainer.addContent(oControl);
				}.bind(this));

			}.bind(this));
		},

		_addAdditionalFieldDecimal: function (oView, oContainer, oModel, iIndex, fnNumberChange, oAdditionalField, oAddFields) {
			//decimal field with variable precision and scale
			var sId = oView.getId() + oAdditionalField.Fieldname + "addFieldInputDecimal";

			//Label
			var oLabel = new Label(sId + "Label", {
				required: "{create>Required}",
				text: "{create>FieldLabel}"
			});
			oLabel.setBindingContext(
				oModel.createBindingContext("/AdditionalFields/" + iIndex),
				"create"
			);
			oView.addDependent(oLabel);
			oContainer.addContent(oLabel);

			//Input Fields
			//Note 2819539: Disable additional fields in case of "edit posted leave" scenario
			var oInput = new Input(sId, {
				type: "Text",
				change: fnNumberChange,
				textAlign: "Right",
				editable: this.oCreateModel.getProperty("/sEditMode") !== "DELETE",
				enabled: "{ parts: [{ path: 'create>Readonly' }, { path: 'StartDate' }, { path: 'AbsenceTypeCode' }], formatter: 'hcm.fab.myleaverequest.utils.formatters.isAdditionalFieldEnabled' }"
			});

			oInput.setBindingContext(
				oModel.createBindingContext("/AdditionalFields/" + iIndex),
				"create"
			);

			//field-dependent value binding
			oInput.bindValue({
				path: "create>fieldValue",
				type: new Decimal({
					parseAsString: true,
					decimals: parseInt(oAdditionalField.Decimals, 10),
					maxIntegerDigits: (parseInt(oAdditionalField.Length, 10) - parseInt(oAdditionalField.Decimals, 10)),
					minFractionDigits: 0,
					maxFractionDigits: parseInt(oAdditionalField.Decimals, 10)
				}, {
					precision: parseInt(oAdditionalField.Length, 10),
					scale: parseInt(oAdditionalField.Decimals, 10)
				})
			});

			oView.addDependent(oInput);
			oContainer.addContent(oInput);

			if (!oAddFields[oAdditionalField.Fieldname]) {
				oAddFields[oAdditionalField.Fieldname] = [];
				oAddFields[oAdditionalField.Fieldname].push(oLabel);
				oAddFields[oAdditionalField.Fieldname].push(oInput);
			}
		},

		/*
		 * Copies additional fields value saved in the local model to the ODATA model.
		 */
		_copyAdditionalFieldsIntoModel: function (aAdditionalFieldsProperty, oModel, sBasePath) {
			aAdditionalFieldsProperty.forEach(function (oAdditionalFieldProperty) {
				var vFieldValue = oAdditionalFieldProperty.fieldValue,
					oDateFormat = null;
				switch (oAdditionalFieldProperty.Type_Kind) {
				case "C":
					// Boolean are treated as 'X'/'' (Edm.String type) by the backend 
					// until SAP-note 2732263 was applied in the backend
					if (!this._bCheckboxFieldsAreBoolean && typeof vFieldValue === "boolean" || this._isCustomerAdditionalFieldCheckbox(
							oAdditionalFieldProperty)) {
						vFieldValue = vFieldValue ? "X" : "";
					}
					break;

				case "N":
					// We use sap.ui.model.Integer type for "P" integer fields to
					// do the validation. Although we must convert the value to
					// string here because the OData model expects an Edm.String
					// type.
					vFieldValue = vFieldValue + "";
					break;

				case "P":
					// Handle no number in decimal field
					if (typeof vFieldValue === "string" && vFieldValue === "") {
						vFieldValue = null;
					}
					break;

				case "D":
					if (oAdditionalFieldProperty.Fieldname.startsWith("CUSTOMER")) {
						//convert to ABAP date format string
						oDateFormat = DateFormat.getDateInstance({
							pattern: "yyyyMMdd"
						});
						vFieldValue = oDateFormat.format(vFieldValue);
					}
					break;
				default:
				}

				oModel.setProperty(sBasePath + "/AdditionalFields/" + oAdditionalFieldProperty.Fieldname, vFieldValue);
			}.bind(this));
		},

		_requiredAdditionalFieldsAreFilled: function () {
			var bCanSave = true,
				bIsValid = false,
				aRequiredFields = this.byId("additionalFieldsSimpleForm").getControlsByFieldGroupId("LeaveRequiredField");

			aRequiredFields.forEach(function (oRequiredField) {
				bIsValid = this._checkRequiredField(oRequiredField);
				if (!bIsValid) {
					bCanSave = false;
				}
			}.bind(this));

			return bCanSave;
		},

		_checkRequiredField: function (oControl) {
			if (oControl.getRequired && oControl.getRequired() && oControl.getValue) {
				var oMessageManager = sap.ui.getCore().getMessageManager();
				if (oControl.getValue()) {
					//remove possibly existing message from message processor
					var oMessageId = oControl.getId() + "-message",
						aAvailableMessages = oMessageManager.getMessageModel().getData(),
						aMessage = aAvailableMessages.filter(function (oMessage) {
							return oMessage.getId() === oMessageId;
						});

					if (aMessage.length > 0) {
						if (aAvailableMessages.length === 1) {
							this.oCreateModel.setProperty("/saveButtonEnabled", true);
						}
						oMessageManager.removeMessages(aMessage[0]);
					}
					return true;

				} else {
					//add corresponding message to the message manager
					var sErrorMessage = this.getResourceBundle().getText("additionalFieldRequired", oControl.getParent().getLabel().getText()),
						oControlBinding = oControl.getBinding("value");

					this.oCreateModel.setProperty("/saveButtonEnabled", false);
					oMessageManager.addMessages(
						new sap.ui.core.message.Message({
							id: oControl.getId() + "-message",
							message: sErrorMessage,
							type: sap.ui.core.MessageType.Error,
							target: (oControlBinding.getContext() ? oControlBinding.getContext().getPath() + "/" : "") +
								oControlBinding.getPath(),
							processor: oControlBinding.getModel()
						}));

					return false;
				}
			}
			return true;
		},

		_checkFormFieldsForError: function () {
			var aSimpleFormIds = ["additionalFieldsSimpleForm", "generalDataForm", "leaveTypeSelectionForm"],
				aFormContent = [];

			return aSimpleFormIds.some(function (sSimpleFormId) {
				aFormContent = this.byId(sSimpleFormId).getContent();
				if (aFormContent && aFormContent.length > 0) {
					return aFormContent.some(function (oFormContent) {
						//check for any field in error state
						return oFormContent.getValueState && oFormContent.getValueState() === sap.ui.core.ValueState.Error;
					});
				}
				return false;
			}.bind(this));
		},

		/*
		 * BEWARE: this function can only be called after the metadata from the ODATA model has been loaded
		 * sap.ui.model.odata.ODataMetaModel.loaded()
		 */
		_getAdditionalFieldMetaInfo: function (sFieldName) {
			var sSchemaNamespace = this.oODataModel.getServiceMetadata().dataServices.schema[0].namespace,
				oComplexTypeProperties = this.oODataModel.getMetaModel().getODataComplexType(sSchemaNamespace + ".AdditionalFields").property,
				aProperty = oComplexTypeProperties.filter(function (oProperty) {
					return oProperty.name === sFieldName;
				});
			return aProperty.length > 0 ? aProperty[0] : {};
		},

		/*
		 * BEWARE: this function can only be called after the metadata from the ODATA model has been loaded
		 * sap.ui.model.odata.ODataMetaModel.loaded()
		 */
		_getLeaveSpanDateFieldMetaInfo: function (sFieldName) {
			var oFuncTypeProperties = this.oODataModel.getMetaModel().getODataFunctionImport("CalculateLeaveSpan").parameter,
				aProperty = oFuncTypeProperties.filter(function (oProperty) {
					return oProperty.name === sFieldName;
				});
			return aProperty.length > 0 ? aProperty[0] : {};
		},

		/*
		 * BEWARE: this function can only be called after the metadata from the ODATA model has been loaded
		 * sap.ui.model.odata.ODataMetaModel.loaded()
		 */
		_quotaAvailabilityFIHasDateParams: function () {
			var oFuncTypeProperties = this.oODataModel.getMetaModel().getODataFunctionImport("CalculateQuotaAvailable").parameter;
			return oFuncTypeProperties.filter(function (oProperty) {
				return oProperty.name === "StartDate"; //one of the added date fields
			}).length > 0;
		},

		_isAdditionalFieldBoolean: function (sFieldName) {
			return this._getAdditionalFieldMetaInfo(sFieldName).type === "Edm.Boolean";
		},

		_isCustomerAdditionalFieldCheckbox: function (oAdditionalField) {
			if (oAdditionalField.Fieldname.startsWith("CUSTOMER")) {
				return parseInt(oAdditionalField.Length, 10) === 1;
			}
			return false;
		},

		_isFieldShownAsCheckbox: function (oAdditionalField) {
			return this._isAdditionalFieldBoolean(oAdditionalField.Fieldname) || this._isCustomerAdditionalFieldCheckbox(oAdditionalField);
		},

		/*
		 * BEWARE: this function can only be called after the metadata from the ODATA model has been loaded
		 * sap.ui.model.odata.ODataMetaModel.loaded()
		 */
		_checkForSearchApproverPropertyExistence: function () {
			var sSchemaNamespace = this.oODataModel.getServiceMetadata().dataServices.schema[0].namespace,
				oEntityType = this.oODataModel.getMetaModel().getODataEntityType(sSchemaNamespace + ".SearchApprover");

			if (oEntityType) {
				//check for property existence in metadata
				return oEntityType.property.some(function (oProperty) {
					return oProperty.name === "EmployeeID";
				});
			}
			return false;
		},

		_getApproverSearchFilters: function () {
			return this._bApproverOnBehalfPropertyExists ? [new Filter("EmployeeID", FilterOperator.EQ, this.getModel("global").getProperty(
				"/sEmployeeNumber"))] : [];
		},

		_getAdditionalFields: function (oAdditionalFieldPaths) {
			var oFieldMapping = {},
				oAdditionalField = {};

			return oAdditionalFieldPaths.definition.map(function (sAdditionalFieldPath) {
				oAdditionalField = this.oODataModel.getObject("/" + sAdditionalFieldPath);
				oAdditionalField.fieldValue = oAdditionalFieldPaths.values[oAdditionalField.Fieldname];
				oAdditionalField.descriptionText = "";

				if (oAdditionalField.HasF4 && !oAdditionalField.hasOwnProperty("F4KeyProperty")) {
					oFieldMapping = O_SEARCH_HELPER_MAPPINGS[oAdditionalField.Fieldname];
					if (oFieldMapping) {
						oAdditionalField.F4KeyProperty = oFieldMapping.keyField;
						oAdditionalField.F4TitleProperty = oFieldMapping.titleField;
						oAdditionalField.F4DescriptionProperty = oFieldMapping.descriptionField;
						oAdditionalField.F4SearchFilter = oFieldMapping.searchFields;
					}
				}
				return oAdditionalField;
			}.bind(this));
		},

		_getInitialRadioGroupIndex: function (oAbsenceTypeData, oStartDate, oEndDate) {
			// Decide initial radio button
			var iInitialGroupIndex = 0; // multi-day
			// -> likely 1 day or less
			if (!formatter.isMoreThanOneDayAllowed(oAbsenceTypeData.IsAllowedDurationMultipleDay) ||
				// same start and end dates + one day or less allowed
				(formatter.isOneDayOrLessAllowed(oAbsenceTypeData.IsAllowedDurationPartialDay, oAbsenceTypeData.IsAllowedDurationSingleDay) &&
					oStartDate && oEndDate && oStartDate.getTime() === oEndDate.getTime())) {
				iInitialGroupIndex = 1; // single-day
			}
			return iInitialGroupIndex;
		},

		_updateLocalModel: function (oAdditionalFieldPaths, oAbsenceTypeData, oStartDate, oEndDate) {
			this.setModelProperties(this.oCreateModel, {
				"multiOrSingleDayRadioGroupIndex": this._getInitialRadioGroupIndex(oAbsenceTypeData, oStartDate, oEndDate), // bound TwoWay in view
				"isAttachmentMandatory": oAbsenceTypeData.AttachmentMandatory,
				"isQuotaCalculated": oAbsenceTypeData.IsQuotaUsed,
				"BalanceAvailableQuantityText": this.getResourceBundle().getText("availabilityCalculation"),
				"AllowedDurationMultipleDayInd": oAbsenceTypeData.IsAllowedDurationMultipleDay,
				"AllowedDurationPartialDayInd": oAbsenceTypeData.IsAllowedDurationPartialDay,
				"AllowedDurationSingleDayInd": oAbsenceTypeData.IsAllowedDurationSingleDay,
				"AdditionalFields": this._getAdditionalFields(oAdditionalFieldPaths),
				"IsMultiLevelApproval": oAbsenceTypeData.IsMultiLevelApproval,
				"iMaxApproverLevel": oAbsenceTypeData.ApproverLevel,
				"isApproverEditable": !oAbsenceTypeData.IsApproverReadOnly,
				"isApproverVisible": oAbsenceTypeData.IsApproverVisible,
				"isAddDeleteApproverAllowed": oAbsenceTypeData.AddDelApprovers,
				"isNoteVisible": oAbsenceTypeData.IsNoteVisible,
				"showTimePicker": oAbsenceTypeData.IsRecordInClockTimesAllowed && oAbsenceTypeData.IsAllowedDurationPartialDay,
				"showInputHours": oAbsenceTypeData.IsRecordInClockHoursAllowed && oAbsenceTypeData.IsAllowedDurationPartialDay,
				"AbsenceDescription": oAbsenceTypeData.AbsenceDescription ? oAbsenceTypeData.AbsenceDescription : null,
				"AbsenceTypeName": oAbsenceTypeData.AbsenceTypeName,
				"oLeaveStartDate": DateUtil.convertToLocal(oStartDate),
				"oLeaveEndDate": DateUtil.convertToLocal(oEndDate)
			});
			if (oAbsenceTypeData.IsQuotaUsed) {
				this._updateAvailableQuota(oAbsenceTypeData, oStartDate, oEndDate);
			}
		},

		_updateLeaveRequestWithModifiedAttachments: function (oModel, leavePath) {
			//count available attachments from model
			var oLeaveRequestToEdit = oModel.getProperty(leavePath);
			var aAttachmentsFromModel = Array.apply(null, {
				length: I_MAX_ATTACHMENTS
			}).map(function (oUndefined, iIdx) {
				return oLeaveRequestToEdit["Attachment" + (iIdx + 1)];
			}).filter(function (oAttachment) {
				return oAttachment && oAttachment.FileName !== "";
			});

			//Add information about removed files by delta check with upload collection
			//count available attachments from model
			var aAttachmentsFromCollection = [],
				//check whether all attachments from the model are still available in the list from the upload collection
				bFileFound = false;
			if (this.oUploadCollection) {
				aAttachmentsFromCollection = this.oUploadCollection.getItems();
			} else if (this.oUploadSet) {
				aAttachmentsFromCollection = this.oUploadSet.getItems();
			}
			aAttachmentsFromModel.forEach(function (oModelAttachment, iIdx) {
				bFileFound = aAttachmentsFromCollection.some(function (oUploadAttachment) {
					return oUploadAttachment.getProperty("fileName") === oModelAttachment.FileName;
				});
				if (!bFileFound) {
					//file from model is no longer available -> it got deleted (AttachmentStatus = D)
					this.oODataModel.setProperty(leavePath + "/Attachment" + (iIdx + 1) + "/AttachmentStatus", "D");
				}
			}.bind(this));

			//Prepare LeaveRequest for new attachment data (if available)
			if (this.oUploadSet) {
				aAttachmentsFromCollection = this.oUploadSet.getIncompleteItems();
			}
			aAttachmentsFromCollection.forEach(function (oUploadItem, iIdx) {
				var oFileInfo;
				if (oUploadItem.getFileObject) {
					oFileInfo = oUploadItem.getFileObject();
				} else {
					oFileInfo = this._oNewFileData[oUploadItem.getFileName()];
				}
				if (oFileInfo) {
					var sBasePropertyPath = leavePath + "/Attachment" + (aAttachmentsFromModel.length + 1),
						iFileSizeInKB = Math.ceil(oFileInfo.size / 1024);

					this.oODataModel.setProperty(sBasePropertyPath + "/FileName", oUploadItem.getFileName());
					this.oODataModel.setProperty(sBasePropertyPath + "/FileType", oFileInfo.type);
					this.oODataModel.setProperty(sBasePropertyPath + "/FileSize", iFileSizeInKB.toString());
				}
			}.bind(this));
		},

		_showSuccessStatusMessage: function (oParams) {
			utils.navTo.call(this, "overview");
			this.oCreateModel.setProperty("/busy", false);
			//send event to refresh the overview page
			this.getOwnerComponent().getEventBus().publish("hcm.fab.myleaverequest", "invalidateoverview", {
				// Show toast after the navigation to the overview page
				fnAfterNavigate: function () {
					if (oParams.showSuccess) {
						jQuery.sap.delayedCall(400, this, function () {
							MessageToast.show(this.getResourceBundle().getText("createdSuccessfully"));
						});
					}
				}.bind(this)
			});
			this.initLocalModel();
			this.getView().setBindingContext(null);
			this._doAttachmentCleanup();

			return Promise.resolve(oParams);
		},

		_doAttachmentCleanup: function (oEvent) {
			this._oAttachmentsContainer.destroyItems();
			this.oUploadCollection = null;
			this.oUploadSet = null;
			this._oNewFileData = {};
		},

		_uploadAttachments: function (oParams) {
			return new Promise(function (fnResolve, fnReject) {
				if (this.oUploadCollection) {
					this._uploadAttachmentsUploadCollection(fnResolve, fnReject, oParams);
				} else if (this.oUploadSet) {
					this._uploadAttachmentsUploadSet(fnResolve, fnReject, oParams);
				} else {
					fnResolve(oParams);
				}
			}.bind(this));
		},

		_uploadAttachmentsUploadSet: function (fnResolve, fnReject, oParams) {
			var aUploadSetPendingItems = this.oUploadSet.getIncompleteItems(),
				oItemToUpload = null,
				iUploadsCompleted = 0,
				iUploadProgressTotal = aUploadSetPendingItems.length;

			if (aUploadSetPendingItems.length === 0) {
				fnResolve(oParams);
				return;
			}

			// prepare
			var oCopiedLeave = jQuery.extend({}, this.getView().getBindingContext().getObject());
			if (oParams.requestID && oParams.requestID !== oCopiedLeave.RequestID) {
				//use the provided requestID
				oCopiedLeave.RequestID = oParams.requestID;
			}

			var sUploadUrl = this._getAttachmentsUploadUrl(this.oODataModel.createKey("/LeaveRequestSet", oCopiedLeave));
			this.oUploadSet.setUploadUrl(sUploadUrl);
			aUploadSetPendingItems.forEach(function (oUploadSetItem) {
				oUploadSetItem.setUrl(sUploadUrl);
			});

			var fnUploadCompleted = function (oEvent) {
				var oItem = oEvent.getParameter("item");

				iUploadsCompleted++;
				var fPercentage = (iUploadsCompleted / iUploadProgressTotal * 100);

				// gather information about uploaded file
				oParams.aUploadedFiles.push({
					FileName: oItem.getFileObject().fileName
				});
				if (fPercentage >= 100) {
					// done uploading
					this.oUploadSet.detachUploadCompleted(fnUploadCompleted);
					fnResolve(oParams);
				} else {
					//upload next attachment
					oItemToUpload = aUploadSetPendingItems.shift();
					this.oUploadSet.uploadItem(oItemToUpload);
				}
			}.bind(this);

			this.oUploadSet.attachUploadCompleted(fnUploadCompleted);

			// upload the attachments sequentially
			oItemToUpload = aUploadSetPendingItems.shift();
			this.oUploadSet.uploadItem(oItemToUpload);
		},

		_uploadAttachmentsUploadCollection: function (fnResolve, fnReject, oParams) {
			var aUploadCollectionItems = this.oUploadCollection.getItems(),
				iUploadsCompleted = 0,
				iUploadProgressTotal = 0;

			aUploadCollectionItems.forEach(function (oUploadCollectionItem) {
				if (oUploadCollectionItem._status !== "display") {
					iUploadProgressTotal++;
				}
			});
			if (iUploadProgressTotal === 0) {
				fnResolve(oParams);
				return;
			}

			// prepare
			var oCopiedLeave = jQuery.extend({}, this.getView().getBindingContext().getObject());
			if (oParams.requestID) {
				//use the provided requestID
				oCopiedLeave.RequestID = oParams.requestID;
			}

			var sNewBindingPath = this.oODataModel.createKey("/LeaveRequestSet", oCopiedLeave),
				sUploadUrl = this._getAttachmentsUploadUrl(sNewBindingPath);
			this._updateUploadUrlsUploadCollection(aUploadCollectionItems, sUploadUrl);

			// show progress immediately...
			this.oCreateModel.setProperty("/uploadPercentage", 5);

			// ------ handle upload process ------
			var fnUploadComplete = function (oEvent) {
				oEvent.getParameter("files").forEach(function (oFile) {
					if (parseInt(oFile.status, 10) >= 400) {
						//handle error
						var XmlContent = jQuery.parseXML(oFile.responseRaw),
							oError = utils.convertXML2JSON(XmlContent.documentElement);

						//inform enduser about upload error
						MessageBox.warning(this.getResourceBundle().getText("txtUploadError", [oFile.fileName]), {
							title: this.getResourceBundle().getText("txtUploadErrorTitle"),
							details: oError.message,
							onClose: function () {
								oParams.showSuccess = false;
								fnResolve(oParams);
							}
						});

					} else {
						//handle success
						iUploadsCompleted++;
						var fPercentage = (iUploadsCompleted / iUploadProgressTotal * 100);
						this.oCreateModel.setProperty("/uploadPercentage", fPercentage);

						// gather information about uploaded file
						oParams.aUploadedFiles.push({
							FileName: oFile.fileName
						});
						if (fPercentage >= 100) {
							// done uploading
							fnResolve(oParams);
						}
					}
				}.bind(this));
				this.oUploadCollection.detachUploadComplete(fnUploadComplete);
			}.bind(this);

			this.oUploadCollection.attachUploadComplete(fnUploadComplete, this);

			// upload
			this.oUploadCollection.upload();
		},

		_initOverlapCalendar: function () {
			if (!this._oOverlapCalendar) {
				this.oCreateModel.setProperty("/calendar/overlapNumber", 0);
				this._oOverlapCalendar = new TeamCalendarControl({
					id: "overlapTeamCalendar",
					applicationId: "MYLEAVEREQUESTS",
					instanceId: "OVERLAP",
					assignmentId: "{global>/sEmployeeNumber}",
					requesterId: "{global>/sEmployeeNumber}",
					startDate: "{StartDate}",
					leaveRequestMode: true,
					leaveRequestSimulateRequest: true,
					leaveRequestStartDate: "{StartDate}",
					leaveRequestEndDate: "{EndDate}",
					leaveRequestDescription: "{create>/calendarOverlapLeaveRequestText}",
					showConcurrentEmploymentButton: false,
					visible: "{create>/calendar/opened}",
					dataChanged: function (oEvent) {
						this.oCreateModel.setProperty("/calendar/overlapNumber", oEvent.getParameter("employeeConflictList").length);
					}.bind(this)
				});
				this.getView().addDependent(this._oOverlapCalendar);

				// Configure teamcalendar refresh on leaverequest changes, if available
				if (this._oOverlapCalendar.getMetadata().hasProperty("dataChangedDate")) {
					this._oOverlapCalendar.bindProperty("dataChangedDate", {
						path: "/lastLeaveRequestChangeDate",
						model: "global",
						mode: "OneWay"
					});
				}
			}
			this.oCreateModel.setProperty("/calendarOverlapLeaveRequestText", this.getResourceBundle().getText(this.oCreateModel.getProperty(
					"/sEditMode") === "EDIT" ?
				"calendarOverlapLeaveRequestEditText" : "calendarOverlapLeaveRequestText"));
		},

		_showBusyDialog: function (oSourceControl) {
			var bShowBusy = this.getModel("global").getProperty("/bShowBusyIndicatorForFunctionImports");
			if (bShowBusy) {
				this.byId("busyDialog").open();
				if (oSourceControl) {
					this._oControlToFocus = oSourceControl;
				}
			}
		},

		_closeBusyDialog: function () {
			var bShowBusy = this.getModel("global").getProperty("/bShowBusyIndicatorForFunctionImports");
			if (bShowBusy) {
				this.byId("busyDialog").close();
				if (this._oControlToFocus) {
					this._oControlToFocus.focus();
					this._oControlToFocus = null;
				}
			}
		},

		_convertHoursMinutesFromDateToDecimal: function (oDate) {
			var oLocalDate = oDate;
			if (!oLocalDate) {
				oLocalDate = new Date(0, 0);
			}
			return parseFloat((oLocalDate.getHours() + ((1 / 60) * oLocalDate.getMinutes())), 10);
		},

		_getDecimalHoursFromTimepicker: function () {
			return this._convertHoursMinutesFromDateToDecimal(this.byId("traditionalHoursPicker").getDateValue());
		},

		_getDecimalHoursFromInputControl: function () {
			var oInputHours = this.byId("hoursValue");
			return parseFloat(oInputHours.getValue());
		}

	});
});