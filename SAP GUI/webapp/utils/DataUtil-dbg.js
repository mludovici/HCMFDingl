/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([
	"sap/ui/base/Object",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"hcm/fab/lib/common/util/DateUtil"
], function (ui5Object, Filter, FilterOperator, DateUtil) {
	"use strict";

	var MINIMUM_READ_INTERVALL = 6; // in months; this allows paging 2 times (pair of months) in the future, without loading data
	var MONTH_TO_START_READ_INTO_NEXT_YEAR = 8; // 8=september; in september start reading months of next year aswell
	var SAP_STANDARD_LEAVE_OVERVIEW_SELECT_PROPERTIES = [
		"EmployeeID",
		"RequestID",
		"ChangeStateID",
		"LeaveKey",
		"StatusID",
		"StatusTxt",
		"AbsenceTypeCode",
		"AbsenceTypeName",
		"StartDate",
		"StartTime",
		"EndDate",
		"EndTime",
		"PlannedWorkingHours",
		"PlannedWorkingDays",
		"CalendarDays",
		"PayrollDays",
		"TimeUnitTxt",
		"IsDeletable",
		"IsModifiable",
		"QuotaUsed",
		"ApproverEmployeeID",
		"ApproverEmployeeName",
		"FirstSubmissionDate",
		"FirstSubmissionTime",
		"AttachmentsExist",
		"ReqOrInfty"
	];
	var SAP_STANDARD_LEAVEREQUEST_PROPERTIES = [
		"EmployeeID",
		"RequestID",
		"ChangeStateID",
		"LeaveKey",
		"StatusID",
		"StatusTxt",
		"AbsenceTypeCode",
		"AbsenceTypeName",
		"StartDate",
		"StartTime",
		"EndDate",
		"EndTime",
		"Notes",
		"PlannedWorkingHours",
		"PlannedWorkingDays",
		"CalendarDays",
		"PayrollDays",
		"TimeUnitTxt",
		"IsDeletable",
		"IsModifiable",
		"QuotaUsed",
		"ApproverEmployeeID",
		"ApproverEmployeeName",
		"IsMultiLevelApproval",
		"LeaveRequestType",
		"FirstSubmissionDate",
		"FirstSubmissionTime",
		"AttachmentsExist",
		"AdditionalFields",
		"ApproverLvl1",
		"ApproverLvl2",
		"ApproverLvl3",
		"ApproverLvl4",
		"ApproverLvl5",
		"Attachment1",
		"Attachment2",
		"Attachment3",
		"Attachment4",
		"Attachment5",
		"ActionID"
	];
	var _oInstance;

	/* global Promise */

	var DataUtil = ui5Object.extend("hcm.fab.myleaverequest.utils.DataUtil", {
		constructor: function (sEmployeeId, oModel) {
			// OData request
			var oMetaModel = oModel.getMetaModel(),
				oEntitySetInfo = oMetaModel.getODataEntitySet("LeaveRequestSet"),
				aProperties = oMetaModel.getODataEntityType(oEntitySetInfo.entityType).property,
				aCustomProperties = [];

			if (aProperties.some(function (oProperty) {
					return oProperty.name === "ReqOrInfty"; //check for new property existence
				}.bind(this))) {
				SAP_STANDARD_LEAVEREQUEST_PROPERTIES.push("ReqOrInfty");

				//try to find customer-own enhancements for entity "LeaveRequest"
				aProperties.forEach(function (oProperty) {
					if (SAP_STANDARD_LEAVEREQUEST_PROPERTIES.indexOf(oProperty.name) === -1) {
						aCustomProperties.push(oProperty.name);
					}
				});

				this._sLeaveOverviewSelectParams = this._buildSelectParams(SAP_STANDARD_LEAVE_OVERVIEW_SELECT_PROPERTIES.concat(aCustomProperties));
			} else {
				this._sLeaveOverviewSelectParams = this._buildSelectParams(SAP_STANDARD_LEAVEREQUEST_PROPERTIES);
			}

			this._sEmployeeId = sEmployeeId;
			this._oModel = oModel;
			this._oPendingRequest = undefined;
			this._oBufferUtil.refresh(); // initialize buffer
		},

		_buildSelectParams: function (aProperties) {
			return aProperties.join();
		},

		refresh: function () {
			this._oBufferUtil.refresh();
		},

		getCalendarEvents: function (oStartDate, oEndDate) {
			// Previous request is still pending?
			if (this._oPendingRequest) {
				// Wait for previous request to complete, then retry
				return this._oPendingRequest.then(function () {
					return this.getCalendarEvents(oStartDate, oEndDate);
				}.bind(this));
			}

			// Determine start/end date for reading the work schedule information
			var oStartDateWorkSchedule = oStartDate,
				oEndDateWorkSchedule = oEndDate;
			if (!oEndDate) {
				// only start date is given -> the leave request list is requesting the data (it does this before the calendar)
				// -> guess which data will later be requested by the calendar:
				// use this heuristic:
				// 1) Round start date to start of the current (=today) year
				// 2) Round end date to end of the current year
				// 3) If today and end date are too close (smaller MINIMUM_READ_INTERVALL), also read a few month from next year
				var oToday = new Date();
				oStartDateWorkSchedule = new Date(oToday.getFullYear(), 0, 1);
				if (oToday.getMonth() < MONTH_TO_START_READ_INTO_NEXT_YEAR) {
					oEndDateWorkSchedule = new Date(oToday.getFullYear(), 11, 31);
				} else {
					// close to year end -> also read ahead into next year
					// example: today = september, read 6 month ahead -> end date = end of february
					oEndDateWorkSchedule = this._calculateMinimumEndDate(oToday);
				}
			}

			// Read leave requests and work schedule
			this._oPendingRequest =
				Promise.all([
					this._readLeaveRequest(oStartDate),
					this._readWorkSchedule(oStartDateWorkSchedule, oEndDateWorkSchedule)
				]).then(function () {
					// Build response from buffer
					this._oPendingRequest = undefined;
					return this._oBufferUtil.getDataFromBuffer(oStartDate, oEndDate);
				}.bind(this));
			return this._oPendingRequest;
		},

		_readLeaveRequest: function (oStartDate) {
			// Check if leave requests were already read (for a earlier begda)
			var oLeaveRequestReadDate = this._oBufferUtil.getLeaveRequestReadDate();
			if (oLeaveRequestReadDate && oLeaveRequestReadDate <= oStartDate) {
				return Promise.resolve();
			}

			// Build odata filter
			var aFilters = [
				new Filter("StartDate", FilterOperator.GE, DateUtil.convertToUTC(oStartDate)),
				new Filter("EmployeeID", FilterOperator.EQ, this._sEmployeeId)
			];

			return new Promise(function (resolve, reject) {
				this._oModel.read("/LeaveRequestSet", {
					filters: aFilters,
					groupId: "leaveRequests",
					urlParameters: {
						"$select": this._sLeaveOverviewSelectParams
					},
					success: function (oData) {
						// Add read data to buffer
						this._oBufferUtil.addLeaveRequestData(oStartDate, oData.results);
						resolve();
					}.bind(this),
					error: function () {
						reject();
					}
				});
			}.bind(this));
		},

		_readWorkSchedule: function (oStartDate, oEndDate) {
			// Round end date to end of month
			var _oStartDate = new Date(oStartDate.getFullYear(), oStartDate.getMonth());
			var _oEndDate = new Date(oEndDate.getFullYear(), oEndDate.getMonth() + 1, 0);

			// check start / end date against buffer
			while (this._oBufferUtil.isDateInBuffer(_oStartDate) && _oStartDate < _oEndDate) {
				_oStartDate.setMonth(_oStartDate.getMonth() + 1);
			}
			while (this._oBufferUtil.isDateInBuffer(_oEndDate) && _oStartDate < _oEndDate) {
				_oEndDate.setMonth(_oEndDate.getMonth() - 1);
			}

			// Start / end date overlapped? Everything is in buffer already
			if (_oStartDate > _oEndDate) {
				return Promise.resolve();
			}

			// In case that that is read, verify that read intervall has a minimum size
			var _oEndDateMin = this._calculateMinimumEndDate(oStartDate);
			if (_oEndDateMin > _oEndDate) {
				_oEndDate = _oEndDateMin;
				_oEndDate.setDate(1); // temporary set start of month (else "30th march" - "1 month will" be "2nd march")
				while (this._oBufferUtil.isDateInBuffer(_oEndDate) && _oStartDate < _oEndDate) {
					_oEndDate.setMonth(_oEndDate.getMonth() - 1);
				}
				// set date to end of month again
				_oEndDate.setMonth(_oEndDate.getMonth() + 1);
				_oEndDate.setDate(_oEndDate.getDate() - 1);
			}

			// Build odata filter
			var aFilters = [
				new Filter("EmployeeNumber", FilterOperator.EQ, this._sEmployeeId),
				new Filter("StartDate", FilterOperator.BT, DateUtil.convertToUTC(_oStartDate), DateUtil.convertToUTC(_oEndDate))
			];

			// OData request
			return new Promise(function (resolve, reject) {
				this._oModel.read("/EmployeeCalendarSet", {
					filters: aFilters,
					groupId: "leaveRequests",
					success: function (oData) {
						this._oBufferUtil.addWorkScheduleData(_oStartDate, _oEndDate, oData.results);
						resolve();
					}.bind(this),
					error: function () {
						reject();
					}
				});
			}.bind(this));
		},

		_calculateMinimumEndDate: function (oStartDate) {
			if (oStartDate.getMonth() % 2 === 0) {
				// example: in january (=0) read to end of june (=5), allows paging 2 times ahead before reading again
				return new Date(oStartDate.getFullYear(), oStartDate.getMonth() + MINIMUM_READ_INTERVALL, 0);
			} else {
				// example: in febuary (=1) also read to end of june (=5), allows paging 2 times ahead before reading again
				return new Date(oStartDate.getFullYear(), oStartDate.getMonth() + MINIMUM_READ_INTERVALL - 1, 0);
			}
		},

		_oBufferUtil: { // start of buffer utility object
			_oBuffer: {},

			refresh: function () {
				this._oBuffer = {
					oMonths: {}, // workschedule information
					aLeaveRequestData: [], // all leave requests
					oLeaveRequestReadDate: undefined // all requests after this date are already read
				};
			},

			getLeaveRequestReadDate: function () {
				return this._oBuffer.oLeaveRequestReadDate;
			},

			convertLocalDateToBufferKey: function (oDate) {
				// convert 12.02.2018 -> 2018/02
				return oDate.getFullYear() + "/" + ("00" + (oDate.getMonth() + 1)).slice(-2);
			},

			isDateInBuffer: function (oDate) {
				var key = this.convertLocalDateToBufferKey(oDate);
				return this._oBuffer.oMonths[key] !== undefined;
			},

			addDateToBuffer: function (oDate) {
				var key = this.convertLocalDateToBufferKey(oDate);
				this._oBuffer.oMonths[key] = {
					aWorkSchedule: []
				};
			},

			addLeaveRequestData: function (oStartDate, aLeaveRequests) {
				// all leave requests are read together, so clear previous results
				var aLeaveRequestBuffer = [];
				aLeaveRequests.forEach(function (oLeaveRequest) {
					aLeaveRequestBuffer.push(oLeaveRequest);
				});
				this._oBuffer.aLeaveRequestData = aLeaveRequestBuffer;
				this._oBuffer.oLeaveRequestReadDate = oStartDate;
			},

			addWorkScheduleData: function (oStartDate, oEndDate, aWorkSchedule) {
				// Make sure slots for all read months are present in buffer
				var _oBufferStartDate = new Date(oStartDate.getTime());
				while (_oBufferStartDate <= oEndDate) {
					this.addDateToBuffer(_oBufferStartDate);
					_oBufferStartDate.setMonth(_oBufferStartDate.getMonth() + 1);
				}

				// Add workschedule data to buffer
				aWorkSchedule.forEach(function (oWorkScheduleDay) {
					var key = this.convertLocalDateToBufferKey(DateUtil.convertToLocal(oWorkScheduleDay.StartDate));
					var oBufferSlot = this._oBuffer.oMonths[key];
					if (!oBufferSlot) { // failsafe: no slot yet for given key
						this.addDateToBuffer(oWorkScheduleDay.StartDate);
						oBufferSlot = this._oBuffer.oMonths[key];
					}
					this._oBuffer.oMonths[key].aWorkSchedule.push(oWorkScheduleDay);
				}.bind(this));
			},

			getLeaveRequestFromBuffer: function (oStartDate, oEndDate) {
				var aResult = [];
				for (var i = 0; i < this._oBuffer.aLeaveRequestData.length; i++) {
					var oLeave = this._oBuffer.aLeaveRequestData[i];
					var oLeaveStartDate = DateUtil.convertToLocal(oLeave.StartDate);
					var oLeaveEndDate = DateUtil.convertToLocal(oLeave.EndDate);
					if (oLeaveEndDate < oStartDate || (oEndDate && oLeaveStartDate > oEndDate)) {
						continue; // Leave request is outside of requested period
					}
					aResult.push(oLeave);
				}
				return aResult;
			},

			getWorkScheduleFromBuffer: function (oStartDate, oEndDate) {
				var aResult = [];
				var _oStartDate = new Date(oStartDate.getFullYear(), oStartDate.getMonth());
				while (_oStartDate < oEndDate) {
					var key = this.convertLocalDateToBufferKey(_oStartDate);
					var oBufferSlot = this._oBuffer.oMonths[key];
					if (oBufferSlot) {
						var aWorkSchedule = oBufferSlot.aWorkSchedule;
						for (var i = 0; i < aWorkSchedule.length; i++) {
							var oDay = aWorkSchedule[i];
							var oDayStartDate = DateUtil.convertToLocal(oDay.StartDate);
							if (oDayStartDate < oStartDate || oDayStartDate > oEndDate) {
								continue;
							}
							aResult.push(oDay);
						}
					}
					_oStartDate.setMonth(_oStartDate.getMonth() + 1);
				}
				return aResult;
			},

			getDataFromBuffer: function (oStartDate, oEndDate) {
				return {
					leaveRequests: this.getLeaveRequestFromBuffer(oStartDate),
					workSchedule: this.getWorkScheduleFromBuffer(oStartDate, oEndDate)
				};
			}
		} // end of buffer utility object

	});

	DataUtil.getInstance = function (sEmployeeId, oModel) {
		// No previous instance exists or assignment changed?
		if (!_oInstance || _oInstance._sEmployeeId !== sEmployeeId || _oInstance._oModel !== oModel) {
			// Create new instance
			_oInstance = new DataUtil(sEmployeeId, oModel);
		}

		return _oInstance;
	};

	return DataUtil;
});