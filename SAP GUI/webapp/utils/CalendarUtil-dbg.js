/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([
	"sap/ui/base/Object",
	"sap/ui/unified/DateTypeRange",
	"hcm/fab/myleaverequest/utils/formatters",
	"hcm/fab/lib/common/util/DateUtil"
], function (ui5Object, DateTypeRange, Formatter, DateUtil) {
	"use strict";

	var CalendarUtil = ui5Object.extend("hcm.fab.myleaverequest.utils.CalendarUtil", {});

	CalendarUtil.configureCalendar = function (oCalendar, oODataModel, oResourceBundle) {
		if (!oCalendar) {
			return;
		}

		// non-working can be added on a day-by-day basis -> remove local-specific non-working days from calendar
		if (sap.ui.unified.CalendarDayType.NonWorking) {
			// non-working can be added on a day-by-day basis -> remove local-specific non-working days from calendar
			oCalendar.setNonWorkingDays([]);
		}

		// verify if backend supports public holidays and work schedule information
		if (oODataModel) {
			oODataModel.metadataLoaded().then(function () {
				oODataModel.getMetaModel().loaded().then(function () {
					var oProperty = oODataModel.getMetaModel().getProperty(
						"/dataServices/schema/0/entityType/[${name} === 'EmployeeCalendar']/property/[${name} === 'IsPublicHoliday']");
					var bSupported = oProperty && oProperty.type === "Edm.Boolean";
					if (!bSupported) {
						var oLegend = sap.ui.getCore().byId(oCalendar.getLegend());
						oLegend.removeItem(oLegend.getId().replace("-legend", "-pubHolidayCalLegend"));
					}
				});
			});
		}
		
		this._oResourceBundle = oResourceBundle;
	};

	CalendarUtil.fillCalendarWithLeaves = function (oCalendar, aLeaves, oStartDate, oEndDate) {
		if (oStartDate) {
			oStartDate = DateUtil.convertToUTC(oStartDate);
		}
		if (oEndDate) {
			oEndDate = DateUtil.convertToUTC(oEndDate);
		}

		//find entries with multiple leaves for 1 day
		var aStartDateLookup = [],
			aSingleLeaves = [],
			bIsMultiple = false,
			aMultiLeaves = aLeaves.filter(function (oLeave, index, array) {
				aStartDateLookup = array.map(function (oLeaveInner) {
					return oLeaveInner.StartDate.getTime();
				});
				aStartDateLookup.splice(index, 1); //remove current leave entry
				bIsMultiple = aStartDateLookup.indexOf(oLeave.StartDate.getTime()) !== -1;
				if (!bIsMultiple) {
					aSingleLeaves.push(aLeaves[index]);
				}
				return bIsMultiple;
			});

		var fnFillSpecialDates = function (aLeavesSpecial, oCalendar, sTooltip, sType) {
			aLeavesSpecial.forEach(function (oLeave) {
				// reject entries completely outside of requested period
				if (oStartDate && oLeave.EndDate < oStartDate) {
					return;
				}
				if (oEndDate && oLeave.StartDate > oEndDate) {
					return;
				}

				// cut entries partially in the period
				var oLeaveStartDate = (oStartDate && oLeave.StartDate < oStartDate) ? oStartDate : oLeave.StartDate,
					oLeaveEndDate = (oEndDate && oLeave.EndDate > oEndDate) ? oEndDate : oLeave.EndDate,
					// add entry to calendar
					sLeaveKey = oLeave.__metadata.id.substring(oLeave.__metadata.id.lastIndexOf("/") + 1),
					oDateRange = new DateTypeRange({
						startDate: DateUtil.convertToLocal(oLeaveStartDate),
						endDate: DateUtil.convertToLocal(oLeaveEndDate),
						type: sType ? sType : Formatter.getCalendarTypeFromStatus(oLeave.StatusID),
						tooltip: sTooltip ? sTooltip : oLeave.AbsenceTypeName,
						customData: {
							key: "path",
							value: sLeaveKey
						}
					});
				oCalendar.addSpecialDate(oDateRange);
			});
		};

		//Single Days
		fnFillSpecialDates(aSingleLeaves, oCalendar);
		
		//Multiply Leaves
		fnFillSpecialDates(aMultiLeaves, oCalendar, this._oResourceBundle.getText("multiLeaveTxt"), sap.ui.unified.CalendarDayType.Type10);
	};

	CalendarUtil.fillCalendarFromEmployeeCalendar = function (oCalendar, aSpecialDates) {
		var aPublicHolidays = aSpecialDates.filter(function (oSpecialDate) {
			return oSpecialDate.IsPublicHoliday || oSpecialDate.IsPublicHoliday === "TRUE";
		});

		var aNonWorkingDays = aSpecialDates.filter(function (oSpecialDate) {
			return !oSpecialDate.IsWorkingDay || oSpecialDate.IsWorkingDay === "FALSE";
		});

		// add public holidays
		aPublicHolidays.forEach(function (oPublicHoliday) {
			oCalendar.addSpecialDate(new DateTypeRange({
				startDate: DateUtil.convertToLocal(oPublicHoliday.StartDate),
				type: sap.ui.unified.CalendarDayType.Type09,
				tooltip: oPublicHoliday.IsPublicHoliday ? oPublicHoliday.PublicHolidayDescription : ""
			}));
		});

		// add employee-specific non-working days (only as of SAPUI5 1.48 the type 'NonWorking' is available)
		if (sap.ui.unified.CalendarDayType.NonWorking) {
			aNonWorkingDays.forEach(function (oNonWorkingDay) {
				oCalendar.addSpecialDate(new DateTypeRange({
					startDate: DateUtil.convertToLocal(oNonWorkingDay.StartDate),
					type: sap.ui.unified.CalendarDayType.NonWorking
				}));
			});
		}
	};

	return CalendarUtil;
});