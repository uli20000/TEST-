// Evidence-backed partial configuration. null means unknown, never an empty default.
(function(root){
  'use strict';
  const config={
  "center": "994",
  "verified": false,
  "centerName": "新北外送中心",
  "areas": [
    [
      "A",
      "A 區"
    ],
    [
      "B",
      "B 區"
    ],
    [
      "C",
      "C 區"
    ],
    [
      "D",
      "D 區"
    ],
    [
      "E",
      "E 區"
    ],
    [
      "F",
      "F 區"
    ],
    [
      "G",
      "G 區"
    ],
    [
      "H",
      "H 區"
    ],
    [
      "I",
      "I 區"
    ]
  ],
  "restaurants": null,
  "acAssignments": null,
  "nonDeliveryStores": null,
  "scopeEffectiveDate": null,
  "removedStores": null,
  "removedNames": null,
  "removedAreas": null,
  "weatherCities": null,
  "weatherCityByArea": null,
  "weeklySalesNotes": null,
  "forecast": null,
  "readiness": {
    "status": "partial",
    "sourceVerified": true,
    "databaseCompatible": false,
    "liveValidated": false,
    "unknownFields": [
      "restaurants",
      "acAssignments",
      "nonDeliveryStores",
      "scopeEffectiveDate",
      "removedStores",
      "removedNames",
      "removedAreas",
      "weatherCities",
      "weatherCityByArea",
      "weeklySalesNotes",
      "forecast"
    ]
  },
  "evidence": {
    "checkedAt": "2026-11-09",
    "repository": "https://github.com/uli20000/T994",
    "commit": "a8d7d39ef72b4b6d0275af5533e6f15da21da350",
    "projectRef": "gjzpgudjfwotbyyxvmhd",
    "sources": [
      "admin.html"
    ],
    "scope": "Read-only source inspection; not production validation."
  },
  "newSharedDefault": {
    "source": "T995@89b697196e9faad3821f1cca5303b0fef5872991",
    "method": "prior_year_364_days",
    "weeks": 8,
    "growth": 0.06,
    "tplh": 2.5,
    "thirdParty": 0.2,
    "switchThreshold": null,
    "status": "shared_program_baseline",
    "note": "共用程式以995為基準；不是逐中心營運參數或資料驗收。"
  },
  "legacyObserved": {
    "legacyAreaCodes": [
      "J",
      "K"
    ],
    "forecast": {
      "method": "recent_same_weekday_average",
      "weeks": 8,
      "growth": 0.2,
      "tplh": 2.5,
      "thirdParty": 0.2
    },
    "note": "僅保留舊版證據，不作新版共用預估決策。"
  }
};
  if(typeof module!=='undefined'&&module.exports)module.exports=config;else root.CenterBusinessConfig=config;
})(typeof window!=='undefined'?window:globalThis);
