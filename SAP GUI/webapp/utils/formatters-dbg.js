/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([
	"hcm/fab/myleaverequest/utils/utils",
	"sap/ui/model/odata/type/Decimal",
	"sap/ui/core/format/DateFormat",
	"sap/ui/core/format/NumberFormat",
	"sap/ui/core/format/FileSizeFormat",
	"sap/ui/core/LocaleData",
	"hcm/fab/lib/common/util/DateUtil"
], function (utils, Decimal, DateFormat, NumberFormat, FileSizeFormat, LocaleData, DateUtil) {
	"use strict";

	// Shows the date as a single date instead of a dash-separated interval.
	function formatOverviewLeaveDates(sStartDate, sEndDate) {
		if (sStartDate === sEndDate) {
			return sStartDate;
		}
		var sFormatLocale = sap.ui.getCore().getConfiguration().getFormatSettings().getFormatLocale(),
			sDateRange = LocaleData.getInstance(sFormatLocale).getIntervalPattern("d - d");
		sDateRange = sDateRange.replace("{0}", sStartDate);
		sDateRange = sDateRange.replace("{1}", sEndDate);
		return sDateRange;
	}

	//Convert Start/End time to locale conform (short) value 
	function formatTimeToShortLocale(sStartTime, sEndTime) {
		var sFormatLocale = sap.ui.getCore().getConfiguration().getFormatSettings().getFormatLocale(),
			sDateRange = LocaleData.getInstance(sFormatLocale).getIntervalPattern("t - t");

		var oTimeFormatterShort = DateFormat.getTimeInstance({
				style: "short"
			}),
			oStartTime = oTimeFormatterShort.parse(sStartTime),
			oEndTime = oTimeFormatterShort.parse(sEndTime);

		// invalid start/end times given? return early
		if (!oStartTime || !oEndTime) {
			return "";
		} else {
			var sStart = oTimeFormatterShort.format(oStartTime),
				sEnd = oTimeFormatterShort.format(oEndTime);

			sDateRange = sDateRange.replace("{0}", sStart);
			sDateRange = sDateRange.replace("{1}", sEnd);

			return sDateRange;
		}
	}

	function formatDateUTCToDateLocal(oDate) {
		return DateUtil.convertToLocal(oDate);
	}

	function formatFeedTimeStamp(sDate, sLocalTime) {
		// for the notes the backend (for whatever reason?) already converts the time to the users local time
		if (sDate && sLocalTime) {
			var oDate = DateFormat.getDateInstance().parse(sDate),
				oTime = DateFormat.getTimeInstance().parse(sLocalTime),
				newDate = new Date(oDate.getFullYear(), oDate.getMonth(), oDate.getDate(), oTime.getHours(), oTime.getMinutes(), oTime.getSeconds());

			return DateFormat.getDateTimeInstance({
				style: "medium/short",
				relative: false
			}).format(newDate);
		}
		return null;
	}

	function formatCreationTimeStamp(oDate, sTime) {
		if (oDate && sTime) {
			var oTime = DateFormat.getTimeInstance().parse(sTime),
				oNewDate = new Date(oDate.getFullYear(), oDate.getMonth(), oDate.getDate(), oTime.getHours(), oTime.getMinutes(), oTime.getSeconds());
			// function "DateUtil.convertToUTC" converts the date to the users local time (i.e. it SUBTRACTS the timezone offset)
			return DateFormat.getDateTimeInstance({
				style: "medium/short",
				relative: false
			}).format(oNewDate);
		}
		return null;
	}

	function formatAttachmentTimeStamp(oDate, sUTCTime) {
		// for the attachments the time is coming as UTC -> needs to be converted to local time
		if (oDate && sUTCTime) {
			var oTime = DateFormat.getTimeInstance().parse(sUTCTime),
				oNewDate = new Date(oDate.getFullYear(), oDate.getMonth(), oDate.getDate(), oTime.getHours(), oTime.getMinutes(), oTime.getSeconds());
			// function "DateUtil.convertToUTC" converts the date to the users local time (i.e. it SUBTRACTS the timezone offset)
			return DateFormat.getDateTimeInstance({
				style: "medium/short",
				relative: false
			}).format(DateUtil.convertToUTC(oNewDate));
		}
		return null;
	}

	function displayTimeShort() {
		var oTimeFormatterShort = DateFormat.getTimeInstance({
			style: "short"
		});
		return oTimeFormatterShort.oFormatOptions.pattern;
	}

	function formatUsedQuota(sQuota) {
		return sQuota === "0" ? null : sQuota;
	}

	function formatTimeAccountTypeText(sText, oDate) {
		return jQuery.sap.formatMessage(sText, [oDate, oDate]);
	}

	function formatTimeAccountValidityEnd(oEndDate, sUnlimited) {
		if (!oEndDate) {
			return null;
		}
		if (oEndDate.getDate() === 31 && oEndDate.getMonth() === 11 && oEndDate.getFullYear() === 9999) {
			return sUnlimited;
		}
		return DateFormat.getDateInstance().format(oEndDate);
	}

	function formatTimeAccountValidity(sStartDate, sEndDate, sUnlimited) {
		if (!sStartDate && !sEndDate) {
			return null;
		}
		var sFormatLocale = sap.ui.getCore().getConfiguration().getFormatSettings().getFormatLocale(),
			sDateRange = LocaleData.getInstance(sFormatLocale).getIntervalPattern("d - d"),
			oStartDate = DateFormat.getDateInstance().parse(sStartDate),
			oEndDate = DateFormat.getDateInstance().parse(sEndDate),
			bStartDateIsLowDate = oStartDate.getDate() === 1 && oStartDate.getMonth() === 0 && oStartDate.getFullYear() === 1800,
			bEndDateIsHighDate = oEndDate.getDate() === 31 && oEndDate.getMonth() === 11 && oEndDate.getFullYear() === 9999;

		//check for LOW_DATE (01.01.1800) and HIGH_DATE (31.12.9999)
		if (bStartDateIsLowDate && bEndDateIsHighDate) {
			return "";
		}

		sDateRange = sDateRange.replace("{0}", sStartDate);
		sDateRange = sDateRange.replace("{1}", bEndDateIsHighDate ? sUnlimited : sEndDate);
		return sDateRange;
	}

	function localMessageFormatter(a, b, c) {
		if (!b & !c) {
			return "";
		} else {
			return jQuery.sap.formatMessage.apply(this, arguments);
		}
	}

	function itemCountFormatter(iCount) {
		return this.getResourceBundle().getText("items", [iCount]);
	}
	
	function itemCountFormatterAttachments(aAttachments) {
		return this.getResourceBundle().getText("items", [aAttachments.length]);
	}

	function itemCountFormatterAccessibility(iCount) {
		var i18nTextAlias = (iCount === 1) ? "itemsAccSingle" : "itemsAccPlural";
		return this.getResourceBundle().getText(i18nTextAlias, [iCount]);
	}

	function formatUsedQuotaAttribute(sText, sQuota, sTimeUnit) {
		var displayedQuota = formatUsedQuota(sQuota);
		return localMessageFormatter(sText, displayedQuota, sTimeUnit);
	}

	function formatEntitlementStatus(sAmountLeft) {
		var fValue = parseFloat(sAmountLeft);
		if (fValue > 0) {
			return sap.ui.core.ValueState.Success;
		} else if (fValue < 0) {
			return sap.ui.core.ValueState.Error;
		} else {
			return sap.ui.core.ValueState.None;
		}
	}

	function _getSingularPluralTimeUnitText(fValue, sTimeunitCode, oResourceBundle, sFallbackText) {
		switch (sTimeunitCode) {
		case "001": // Hours
			return fValue === 1 ? oResourceBundle.getText("hourTxt") : oResourceBundle.getText("hoursTxt");
		case "010": // Days
			return fValue === 1 ? oResourceBundle.getText("dayTxt") : oResourceBundle.getText("daysTxt");
		default:
			return sFallbackText;
		}
	}

	function formatEntitlementTimeunit(sAmountLeft, sTimeunitCode, sFallbackText) {
		return _getSingularPluralTimeUnitText(parseFloat(sAmountLeft), sTimeunitCode, this.getResourceBundle(), sFallbackText);
	}

	function formatEntitlementTimeunitText(fAmountLeft, sTimeunitCode, sFallbackText) {
		if (fAmountLeft && sTimeunitCode) {
			return this.getResourceBundle().getText("leaveDurTextWCode", [fAmountLeft, _getSingularPluralTimeUnitText(fAmountLeft, sTimeunitCode,
				this.getResourceBundle(), sFallbackText)]);
		}
		return null;
	}

	function availableDays(sAvailableDays) {
		var fValue = parseFloat(sAvailableDays);
		if (!isNaN(fValue)) {
			var oNumberFormat = NumberFormat.getFloatInstance({
				minFractionDigits: 0,
				maxFractionDigits: 2
			});
			return oNumberFormat.format(fValue);
		}
		return sAvailableDays;
	}

	function formatPlannedWorkingDays(sDays) {
		if (sDays) {
			return this.getResourceBundle().getText("leaveDurTextWCode", [availableDays(sDays), _getSingularPluralTimeUnitText(parseFloat(sDays),
				"010", this.getResourceBundle())]);
		}
		return null;
	}

	function formatPlannedWorkingHours(sHours) {
		if (sHours) {
			return this.getResourceBundle().getText("leaveDurTextWCode", [availableDays(sHours), _getSingularPluralTimeUnitText(parseFloat(sHours),
				"001", this.getResourceBundle())]);
		}
		return null;
	}

	function formatPlannedWorkingHoursText(sHours) {
		if (sHours) {
			var fValue = parseFloat(sHours);
			return _getSingularPluralTimeUnitText(fValue, "001", this.getResourceBundle());
		}
		return null;
	}

	function getCalendarTypeFromStatus(sStatus) {
		// Type01: light orange
		// Type02: dark orange
		// Type03: red
		// Type04: brown
		// Type05: pink
		// Type06: blue
		// Type07: light green
		// Type08: dark green
		// Type09: cyan
		// Type10: purple
		switch (sStatus) {
		case "POSTED":
		case "APPROVED":
			return "Type08";
		case "SENT":
			return "Type01";
		case "REJECTED":
			return "Type03";
		default: //fallback (should not happen)
			return "Type06";
		}
	}

	// Formatting method to set the right status of the list items          
	function getListItemStatus(sStatus) {
		switch (sStatus) {
		case "POSTED":
		case "APPROVED":
			return sap.ui.core.ValueState.Success;
		case "SENT":
			return sap.ui.core.ValueState.Warning;
		case "REJECTED":
			return sap.ui.core.ValueState.Error;
		default: //fallback (should not happen)
			return sap.ui.core.ValueState.None;
		}
	}

	// AllowedDurationMultipleDayInd controls whether a one or range
	// of days can be selected. Therefore:
	//
	// - AllowedDurationMultipleDayInd -> can select multiple day (or single day)
	// - !AllowedDurationMultipleDayInd -> can select only a single day
	//
	function isMoreThanOneDayAllowed(bAllowedDurationMultipleDay) {
		return !!bAllowedDurationMultipleDay;
	}

	function isOneDayOrLessAllowed(bAllowedDurationPartialDay, bAllowedDurationSingleDay) {
		return !!bAllowedDurationPartialDay || !!bAllowedDurationSingleDay;
	}

	function isTimeRangeAllowed(bMultiOrSingleDayRadioGroupIndex, bAllowedDurationPartialDayInd) {
		return bMultiOrSingleDayRadioGroupIndex === 1 && !!bAllowedDurationPartialDayInd;
	}

	function isTimeRangeNotAllowed(bMultiOrSingleDayRadioGroupIndex, bAllowedDurationPartialDayInd) {
		return bMultiOrSingleDayRadioGroupIndex === 1 && !bAllowedDurationPartialDayInd;
	}

	function isCalculationSpanAvailableAfterDateRange(bMultiOrSingleDayRadioGroupIndex, bShowCalculation) {
		if (bShowCalculation) {
			if (bMultiOrSingleDayRadioGroupIndex === 0) {
				return true;
			} else {
				return false;
			}
		} else {
			return false;
		}
	}

	function isCalculationSpanAvailableAfterDatePicker(bMultiOrSingleDayRadioGroupIndex, bAllowedDurationPartialDayInd, bShowTimePicker,
		bShowInputHours, bShowCalculation) {
		if (bShowCalculation) {
			if (bMultiOrSingleDayRadioGroupIndex === 1 && !!bAllowedDurationPartialDayInd) {
				if (bShowTimePicker || bShowInputHours) {
					return false;
				} else {
					return true;
				}
			} else {
				return false;
			}
		} else {
			return false;
		}
	}

	function isCalculationSpanAvailableAfterTimeRange(bMultiOrSingleDayRadioGroupIndex, bAllowedDurationPartialDayInd, bShowTimePicker,
		bShowInputHours, bShowCalculation) {
		if (bShowCalculation) {
			if (bMultiOrSingleDayRadioGroupIndex === 1 && !!bAllowedDurationPartialDayInd) {
				if (bShowTimePicker && !bShowInputHours) {
					return true;
				} else {
					return false;
				}
			} else {
				return false;
			}
		} else {
			return false;
		}
	}

	function isCalculationSpanAvailableAfterHourInput(bMultiOrSingleDayRadioGroupIndex, bAllowedDurationPartialDayInd, bShowTimePicker,
		bShowInputHours, bShowCalculation) {
		if (bShowCalculation) {
			if (bMultiOrSingleDayRadioGroupIndex === 1) {
				if (bShowInputHours) {
					return true;
				} else {
					return false;
				}
			} else {
				return false;
			}
		} else {
			return false;
		}
	}

	function isTimePickerAvailable(bMultiOrSingleDayRadioGroupIndex, bShowTimePicker) {
		if (bMultiOrSingleDayRadioGroupIndex === 1 && !!bShowTimePicker) {
			return true;
		} else {
			return false;
		}
	}

	function isInputHoursAvailable(bMultiOrSingleDayRadioGroupIndex, bShowInputHours, bShowIndustryHours) {
		if (bMultiOrSingleDayRadioGroupIndex === 1 && !!bShowInputHours) {
			if (bShowIndustryHours) {
				return true;
			} else {
				return false;
			}
		} else {
			return false;
		}
	}

	function isTraditionalHoursAvailable(bMultiOrSingleDayRadioGroupIndex, bShowInputHours, bShowIndustryHours) {
		if (bMultiOrSingleDayRadioGroupIndex === 1 && !!bShowInputHours) {
			if (bShowIndustryHours) {
				return false;
			} else {
				return true;
			}
		} else {
			return false;
		}
	}

	function convertIndustrialHours(tIndustrialTime) {
		var tValue = new Date(0, 0);
		if (tIndustrialTime === undefined) {
			tIndustrialTime = null;
		}
		tValue.setMinutes(Math.round(+tIndustrialTime * 60));
		return DateFormat.getTimeInstance({
			style: "short",
			relative: false,
			pattern: "HH:mm"
		}).format(tValue);
	}

	function getSingleOrMultipleApproverLabel(bIsMultiple, iLevel, sSingleLabel, sMultipleLabel) {
		if (!bIsMultiple) {
			return sSingleLabel;
		}
		return iLevel > 1 ? sMultipleLabel : sSingleLabel;
	}

	function isAdditionalFieldInputInteger(sType) {
		return !!(sType === "N");
	}

	function isGroupEnabled(oStartDate, sSelectedAbsenceTypeCode) {
		return !!(oStartDate && sSelectedAbsenceTypeCode);
	}

	function isInputHoursEnabled(oStartDate, sSelectedAbsenceTypeCode, bTimeRangeFilled) {
		return isGroupEnabled(oStartDate, sSelectedAbsenceTypeCode) && !bTimeRangeFilled;
	}

	function isTimePickerEnabled(oStartDate, sSelectedAbsenceTypeCode, bInputHoursFilled) {
		return isGroupEnabled(oStartDate, sSelectedAbsenceTypeCode) && !bInputHoursFilled;
	}

	function isAttachmentUploadEnabled(oStartDate, sSelectedAbsenceTypeCode, isAttchmntUploadEnabled) {
		return isGroupEnabled(oStartDate, sSelectedAbsenceTypeCode) && isAttchmntUploadEnabled;
	}

	function isAttachmentUploadDisabled(oStartDate, sSelectedAbsenceTypeCode, isAttchmntUploadEnabled) {
		return !(isGroupEnabled(oStartDate, sSelectedAbsenceTypeCode) && isAttchmntUploadEnabled);
	}

	function usedTimeVisibility(sUsedDays) {
		if (sUsedDays > 0) {
			return true;
		} else {
			return false;
		}
	}

	function isGroupDisabled( /* same signature as isGroupEnabled */ ) {
		return !isGroupEnabled.apply(this, arguments);
	}

	function parseColonSeparatedString(sColonSeparated) {
		//::NEW::00000011::::Herr Michael Kennedy::::Dude where is my car::::20161216::::041550::::HAW
		var oFieldMapping = [
			"EmployeeId",
			"EmployeeName",
			"Text",
			"Date",
			"Time",
			"Timezone"
		];
		var aResult = [];
		if (sColonSeparated) {
			aResult = sColonSeparated.split("::NEW::")
				.filter(function (sFields) {
					return sFields.length > 0;
				})
				.map(function (sFields) {
					var oFields = {};

					sFields.split("::::").forEach(function (sFieldValue, iFieldIdx) {
						var sFieldName = oFieldMapping[iFieldIdx];
						oFields[sFieldName] = sFieldValue;
					});

					return oFields;
				});
		}
		return aResult;
	}

	function formatNotes(sNote) {
		return parseColonSeparatedString(sNote);
	}

	function isOldNotesVisible(sOldNotes) {
		return !!(sOldNotes && sOldNotes.indexOf("::") >= 0);
	}

	function formatQuotaUsage(sNumber, sNumberUnit) {
		//------Note 2607105:Consider non-deductible leave ranges-------
		if (sNumberUnit === null || sNumberUnit === "") {
			return this.getResourceBundle().getText("noDeducPossible");
		}
		//--------------------------------------------------------------
		if (!sNumberUnit) {
			return sNumber;
		}
		// check if sNumber actually is a number
		var fParsedNumber = parseFloat(sNumber);
		if (!isNaN(fParsedNumber)) {

			var sNumberFormatted = availableDays(sNumber);
			if (fParsedNumber === 1) {
				return this.getResourceBundle().getText("usedWorkingTimeSingular", [sNumberFormatted, sNumberUnit]);
			} else {
				return this.getResourceBundle().getText("usedWorkingTimePlural", [sNumberFormatted, sNumberUnit]);
			}
		}
		return sNumber;
	}

	function getCalendarOverlapText(iOverlapNumber) {
		if (iOverlapNumber > 0) {
			if (iOverlapNumber === 1) {
				return this.getResourceBundle().getText("calendarHasOverlapsSingular", [iOverlapNumber]);
			} else {
				return this.getResourceBundle().getText("calendarHasOverlaps", [iOverlapNumber]);
			}
		} else {
			return this.getResourceBundle().getText("calendarNoOverlaps");
		}
	}

	function formatQuotaAvailability(sAvailabilityAmount, bIsQuotaRelevant, sTimeUnit) {
		if (bIsQuotaRelevant === false) {
			return this.getResourceBundle().getText("noQuotaRelevance");
		}
		var fParsedNumber = parseFloat(sAvailabilityAmount);
		if (!isNaN(fParsedNumber)) {
			var sAmountFormatted = availableDays(sAvailabilityAmount);
			if (fParsedNumber === 1) {
				return this.getResourceBundle().getText("availableTxt", [sAmountFormatted, sTimeUnit]);
			} else {
				return this.getResourceBundle().getText("availableTxtPlural", [sAmountFormatted, sTimeUnit]);
			}
		}
		return sAvailabilityAmount;
	}

	function formatNoteText(sText) {
		return jQuery.sap.encodeHTML(sText);
	}

	function formatAttachmentUrl(sEmployeeId, sRequestId, sArchivDocId, sFileName) {
		return this.getModel().sServiceUrl + [
			"/FileAttachmentSet(EmployeeID='" + sEmployeeId + "'",
			"LeaveRequestId='" + sRequestId + "'",
			"ArchivDocId='" + sArchivDocId + "'",
			"FileName='" + jQuery.sap.encodeURL(sFileName) + "')/$value"
		].join(",");
	}

	function isAdditionalFieldEnabled(isReadOnly, oStartDate, sSelectedAbsenceTypeCode) {
		return !isReadOnly && isGroupEnabled(oStartDate, sSelectedAbsenceTypeCode);
	}

	function isRemoveApproverLvl2ButtonEnabled(oStartDate, sSelectedAbsenceTypeCode, iCurrentApproverLevel) {
		if (!isGroupEnabled(oStartDate, sSelectedAbsenceTypeCode)) {
			return false;
		}

		return iCurrentApproverLevel === 2;
	}

	function isRemoveApproverLvl3ButtonEnabled(oStartDate, sSelectedAbsenceTypeCode, iCurrentApproverLevel) {
		if (!isGroupEnabled(oStartDate, sSelectedAbsenceTypeCode)) {
			return false;
		}

		return iCurrentApproverLevel === 3;
	}

	function isRemoveApproverLvl4ButtonEnabled(oStartDate, sSelectedAbsenceTypeCode, iCurrentApproverLevel) {
		if (!isGroupEnabled(oStartDate, sSelectedAbsenceTypeCode)) {
			return false;
		}

		return iCurrentApproverLevel === 4;
	}

	function isRemoveApproverLvl5ButtonEnabled(oStartDate, sSelectedAbsenceTypeCode, iCurrentApproverLevel) {
		if (!isGroupEnabled(oStartDate, sSelectedAbsenceTypeCode)) {
			return false;
		}

		return iCurrentApproverLevel === 5;
	}

	function isAddApproverLvl1ButtonEnabled(oStartDate, sSelectedAbsenceTypeCode, iCurrentApproverLevel, iMaxApproverLevel) {
		if (!isGroupEnabled(oStartDate, sSelectedAbsenceTypeCode)) {
			return false;
		}
		return iCurrentApproverLevel === 1 && iCurrentApproverLevel < iMaxApproverLevel;
	}

	function isAddApproverLvl2ButtonEnabled(oStartDate, sSelectedAbsenceTypeCode, iCurrentApproverLevel, iMaxApproverLevel) {
		if (!isGroupEnabled(oStartDate, sSelectedAbsenceTypeCode)) {
			return false;
		}
		return iCurrentApproverLevel === 2 && iCurrentApproverLevel < iMaxApproverLevel;
	}

	function isAddApproverLvl3ButtonEnabled(oStartDate, sSelectedAbsenceTypeCode, iCurrentApproverLevel, iMaxApproverLevel) {
		if (!isGroupEnabled(oStartDate, sSelectedAbsenceTypeCode)) {
			return false;
		}
		return iCurrentApproverLevel === 3 && iCurrentApproverLevel < iMaxApproverLevel;
	}

	function isAddApproverLvl4ButtonEnabled(oStartDate, sSelectedAbsenceTypeCode, iCurrentApproverLevel, iMaxApproverLevel) {
		if (!isGroupEnabled(oStartDate, sSelectedAbsenceTypeCode)) {
			return false;
		}
		return iCurrentApproverLevel === 4 && iCurrentApproverLevel < iMaxApproverLevel;
	}

	function formatFileSize(fSizeInKB) {
		var fSizeInBytes = parseFloat(fSizeInKB) * 1024;
		return FileSizeFormat.getInstance({
			binaryFilesize: true,
			maxFractionDigits: 1,
			maxIntegerDigits: 3
		}).format(fSizeInBytes);
	}

	function formatImageURL(bShowEmployeePicture, sMediaSrc) {
		if (bShowEmployeePicture && sMediaSrc && typeof sMediaSrc === "string") {
			var sUrl = "",
				oLink = document.createElement("a"),
				fnEncodeApostrophe = function (sString) {
					// encode apostrophes with "%27"
					return sString.replace(new RegExp("'", "g"), "%27");
				};
			oLink.href = sMediaSrc;
			sUrl = (oLink.pathname.charAt(0) === "/") ? oLink.pathname : "/" + oLink.pathname;
			return fnEncodeApostrophe(sUrl);
		}
		return "";
	}

	function formatObjectTitle(bShowEmployeeNumber, bShowEmployeeNumberWithoutZeros, sName, sEmployeeID) {
		var sEmployeeNumberToShow = bShowEmployeeNumberWithoutZeros ? parseInt(sEmployeeID, 10).toString() : sEmployeeID;
		if (sap.ui.Device.system.desktop && sEmployeeID && bShowEmployeeNumber) {
			return sName + " (" + sEmployeeNumberToShow + ")";
		}
		return sName;
	}

	function formatGrowing(sDevice, sCount) {
		//Table need to grow if opened on a Desktop and less than 100 entries.
		if (sDevice.desktop === true && sCount < 100) {
			return false;
		} else {
			return true;
		}

	}

	function formatGrowingThreshold(sDevice) {
		if (sDevice.desktop === true) {
			return 100;
		} else {
			return 15;
		}
	}

	return {
		localMessageFormatter: localMessageFormatter,
		getListItemStatus: getListItemStatus,
		getCalendarTypeFromStatus: getCalendarTypeFromStatus,
		itemCountFormatter: itemCountFormatter,
		itemCountFormatterAccessibility: itemCountFormatterAccessibility,
		itemCountFormatterAttachments: itemCountFormatterAttachments,   
		getSingleOrMultipleApproverLabel: getSingleOrMultipleApproverLabel,
		isRemoveApproverLvl2ButtonEnabled: isRemoveApproverLvl2ButtonEnabled,
		isRemoveApproverLvl3ButtonEnabled: isRemoveApproverLvl3ButtonEnabled,
		isRemoveApproverLvl4ButtonEnabled: isRemoveApproverLvl4ButtonEnabled,
		isRemoveApproverLvl5ButtonEnabled: isRemoveApproverLvl5ButtonEnabled,
		isAddApproverLvl1ButtonEnabled: isAddApproverLvl1ButtonEnabled,
		isAddApproverLvl2ButtonEnabled: isAddApproverLvl2ButtonEnabled,
		isAddApproverLvl3ButtonEnabled: isAddApproverLvl3ButtonEnabled,
		isAddApproverLvl4ButtonEnabled: isAddApproverLvl4ButtonEnabled,
		availableDays: availableDays,
		usedTimeVisibility: usedTimeVisibility,
		isGroupEnabled: isGroupEnabled,
		isGroupDisabled: isGroupDisabled,
		formatNotes: formatNotes,
		isOldNotesVisible: isOldNotesVisible,
		isAdditionalFieldInputInteger: isAdditionalFieldInputInteger,
		isAdditionalFieldEnabled: isAdditionalFieldEnabled,
		isMoreThanOneDayAllowed: isMoreThanOneDayAllowed,
		isOneDayOrLessAllowed: isOneDayOrLessAllowed,
		isTimeRangeAllowed: isTimeRangeAllowed,
		isTimeRangeNotAllowed: isTimeRangeNotAllowed,
		isCalculationSpanAvailableAfterDateRange: isCalculationSpanAvailableAfterDateRange,
		isCalculationSpanAvailableAfterDatePicker: isCalculationSpanAvailableAfterDatePicker,
		isCalculationSpanAvailableAfterTimeRange: isCalculationSpanAvailableAfterTimeRange,
		isCalculationSpanAvailableAfterHourInput: isCalculationSpanAvailableAfterHourInput,
		isTimePickerAvailable: isTimePickerAvailable,
		isTimePickerEnabled: isTimePickerEnabled,
		isTraditionalHoursAvailable: isTraditionalHoursAvailable,
		isInputHoursAvailable: isInputHoursAvailable,
		isInputHoursEnabled: isInputHoursEnabled,
		isAttachmentUploadEnabled: isAttachmentUploadEnabled,
		isAttachmentUploadDisabled: isAttachmentUploadDisabled,
		formatFeedTimeStamp: formatFeedTimeStamp,
		formatAttachmentTimeStamp: formatAttachmentTimeStamp,
		formatCreationTimeStamp: formatCreationTimeStamp,
		formatOverviewLeaveDates: formatOverviewLeaveDates,
		formatUsedQuota: formatUsedQuota,
		formatUsedQuotaAttribute: formatUsedQuotaAttribute,
		formatTimeAccountTypeText: formatTimeAccountTypeText,
		formatTimeAccountValidity: formatTimeAccountValidity,
		formatTimeAccountValidityEnd: formatTimeAccountValidityEnd,
		formatEntitlementStatus: formatEntitlementStatus,
		displayTimeShort: displayTimeShort,
		formatTimeToShortLocale: formatTimeToShortLocale,
		formatDateUTCToDateLocal: formatDateUTCToDateLocal,
		getCalendarOverlapText: getCalendarOverlapText,
		formatQuotaUsage: formatQuotaUsage,
		formatQuotaAvailability: formatQuotaAvailability,
		formatNoteText: formatNoteText,
		formatAttachmentUrl: formatAttachmentUrl,
		formatEntitlementTimeunit: formatEntitlementTimeunit,
		formatEntitlementTimeunitText: formatEntitlementTimeunitText,
		formatPlannedWorkingDays: formatPlannedWorkingDays,
		formatPlannedWorkingHours: formatPlannedWorkingHours,
		formatPlannedWorkingHoursText: formatPlannedWorkingHoursText,
		formatFileSize: formatFileSize,
		formatImageURL: formatImageURL,
		formatObjectTitle: formatObjectTitle,
		convertIndustrialHours: convertIndustrialHours,
		formatGrowing: formatGrowing,
		formatGrowingThreshold: formatGrowingThreshold
	};

}, true /* bExport */ );