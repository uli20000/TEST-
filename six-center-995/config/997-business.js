// Evidence-backed partial configuration. null means unknown, never an empty default.
(function(root){
  'use strict';
  const config={
  "center": "997",
  "verified": false,
  "centerName": "台北外送中心",
  "areas": null,
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
      "areas",
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
    "repository": "https://github.com/uli20000/T997",
    "commit": "fc6f3f8ed5969a813ae2eefbe89601483650302c",
    "projectRef": "qhztjliketfujfiwemxh",
    "sources": [
      "admin.html"
    ],
    "scope": "Read-only source inspection; not production validation.",
    "databaseRead": {
      "table": "public.tc_restaurant_area_map",
      "columns": [
        "restaurant_name",
        "area_code",
        "is_active"
      ],
      "rowCount": 0,
      "checkedAt": "2026-11-09",
      "note": "設定表存在但沒有資料；不等於此中心沒有餐廳或區域。"
    }
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
  }
};
  if(typeof module!=='undefined'&&module.exports)module.exports=config;else root.CenterBusinessConfig=config;
})(typeof window!=='undefined'?window:globalThis);
