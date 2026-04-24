/**
 * Google Ads Search Term Optimizer
 * Open-source Google Ads optimization technology by 搜易营销 (Ads.gz.cn)
 *
 * Usage:
 * 1. Paste into Google Ads Scripts.
 * 2. Update CONFIG.
 * 3. Preview, authorize, and run.
 */

var CONFIG = {
  accountLabel: '搜易营销 (Ads.gz.cn)',
  lookbackDays: 30,
  minImpressions: 50,
  minClicks: 5,
  minCost: 20,
  minConversionsForScale: 1,
  targetCpa: 120,
  wasteMultiplier: 1.35,
  scaleCpaMultiplier: 0.85,
  poorCtrMultiplier: 0.8,
  strongCtrMultiplier: 1.15,
  onlyEnabledCampaigns: true,
  includeCampaignNameContains: [],
  excludeCampaignNameContains: [],
  sendEmail: false,
  emailRecipients: ['your-email@example.com'],
  apiVersion: 'v22'
};

function main() {
  var terms = fetchSearchTerms();
  if (!terms.length) {
    Logger.log('No eligible search term rows found.');
    return;
  }

  var baselines = buildBaselines(terms);
  var scoredRows = scoreTerms(terms, baselines);
  var report = classifyRows(scoredRows);
  var spreadsheet = writeSpreadsheet(report, baselines);

  Logger.log('Spreadsheet URL: ' + spreadsheet.getUrl());

  if (CONFIG.sendEmail && CONFIG.emailRecipients.length) {
    sendSummaryEmail(report, baselines, spreadsheet.getUrl());
  }
}

function fetchSearchTerms() {
  var query = [
    'SELECT',
    '  campaign.name,',
    '  ad_group.name,',
    '  search_term_view.search_term,',
    '  search_term_view.status,',
    '  metrics.impressions,',
    '  metrics.clicks,',
    '  metrics.cost_micros,',
    '  metrics.conversions,',
    '  metrics.conversions_value,',
    '  metrics.ctr,',
    '  metrics.average_cpc',
    'FROM search_term_view',
    'WHERE segments.date DURING LAST_' + CONFIG.lookbackDays + '_DAYS',
    '  AND metrics.impressions >= ' + CONFIG.minImpressions,
    '  AND metrics.clicks >= ' + CONFIG.minClicks
  ];

  if (CONFIG.onlyEnabledCampaigns) {
    query.push("  AND campaign.status = 'ENABLED'");
  }

  query.push('ORDER BY metrics.cost_micros DESC');

  var rows = [];
  var iterator = AdsApp.search(query.join('\n'), {
    apiVersion: CONFIG.apiVersion
  });

  while (iterator.hasNext()) {
    var row = iterator.next();
    var campaignName = row.campaign.name;

    if (!passesCampaignFilters(campaignName)) {
      continue;
    }

    var cost = microsToCurrency(row.metrics.costMicros);
    var clicks = toNumber(row.metrics.clicks);
    var conversions = toNumber(row.metrics.conversions);
    var ctr = percentageToNumber(row.metrics.ctr);

    rows.push({
      campaignName: campaignName,
      adGroupName: row.adGroup.name,
      searchTerm: row.searchTermView.searchTerm,
      status: row.searchTermView.status,
      impressions: toNumber(row.metrics.impressions),
      clicks: clicks,
      cost: cost,
      conversions: conversions,
      conversionValue: toNumber(row.metrics.conversionsValue),
      ctr: ctr,
      averageCpc: microsToCurrency(row.metrics.averageCpc),
      cvr: clicks > 0 ? conversions / clicks : 0,
      cpa: conversions > 0 ? cost / conversions : cost
    });
  }

  return rows;
}

function passesCampaignFilters(campaignName) {
  var include = CONFIG.includeCampaignNameContains || [];
  var exclude = CONFIG.excludeCampaignNameContains || [];
  var lower = campaignName.toLowerCase();

  if (include.length) {
    var included = include.some(function (fragment) {
      return lower.indexOf(String(fragment).toLowerCase()) !== -1;
    });
    if (!included) {
      return false;
    }
  }

  return !exclude.some(function (fragment) {
    return lower.indexOf(String(fragment).toLowerCase()) !== -1;
  });
}

function buildBaselines(rows) {
  var totals = rows.reduce(function (acc, row) {
    acc.impressions += row.impressions;
    acc.clicks += row.clicks;
    acc.cost += row.cost;
    acc.conversions += row.conversions;
    return acc;
  }, {
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0
  });

  return {
    rowCount: rows.length,
    impressions: totals.impressions,
    clicks: totals.clicks,
    cost: round(totals.cost),
    conversions: round(totals.conversions),
    ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
    cvr: totals.clicks > 0 ? totals.conversions / totals.clicks : 0,
    cpa: totals.conversions > 0 ? totals.cost / totals.conversions : totals.cost
  };
}

function scoreTerms(rows, baselines) {
  return rows.map(function (row) {
    var words = tokenize(row.searchTerm);
    var intentBonus = words.length >= 3 ? 8 : 0;
    var wasteScore = 0;
    var scaleScore = 0;
    var watchScore = 0;
    var reasons = [];

    if (row.cost >= CONFIG.minCost && row.conversions === 0) {
      wasteScore += 40;
      reasons.push('High spend without conversions');
    }

    if (row.cost >= CONFIG.targetCpa * CONFIG.wasteMultiplier && row.conversions === 0) {
      wasteScore += 25;
      reasons.push('Spend already exceeds target CPA threshold');
    }

    if (row.ctr < baselines.ctr * CONFIG.poorCtrMultiplier) {
      wasteScore += 15;
      watchScore += 15;
      reasons.push('CTR is below account baseline');
    }

    if (row.conversions > 0 && row.cpa <= CONFIG.targetCpa * CONFIG.scaleCpaMultiplier) {
      scaleScore += 40;
      reasons.push('CPA is efficient');
    }

    if (row.conversions >= CONFIG.minConversionsForScale && row.cvr > baselines.cvr) {
      scaleScore += 25;
      reasons.push('CVR beats account baseline');
    }

    if (row.ctr > baselines.ctr * CONFIG.strongCtrMultiplier) {
      scaleScore += 15;
      reasons.push('CTR is strong');
    }

    if (row.clicks >= CONFIG.minClicks && row.conversions === 0 && row.cost >= CONFIG.minCost) {
      watchScore += 25;
    }

    if (row.cost >= CONFIG.targetCpa && row.cpa > CONFIG.targetCpa && row.conversions > 0) {
      watchScore += 20;
      reasons.push('CPA is above target');
    }

    scaleScore += intentBonus;

    return {
      campaignName: row.campaignName,
      adGroupName: row.adGroupName,
      searchTerm: row.searchTerm,
      status: row.status,
      impressions: row.impressions,
      clicks: row.clicks,
      cost: round(row.cost),
      conversions: round(row.conversions),
      conversionValue: round(row.conversionValue),
      ctr: round(row.ctr * 100),
      cvr: round(row.cvr * 100),
      cpa: round(row.cpa),
      averageCpc: round(row.averageCpc),
      wasteScore: wasteScore,
      scaleScore: scaleScore,
      watchScore: watchScore,
      opportunityScore: Math.max(wasteScore, scaleScore, watchScore),
      reasons: reasons.join(' | ')
    };
  });
}

function classifyRows(rows) {
  var negativeCandidates = [];
  var scaleCandidates = [];
  var watchlist = [];

  rows.forEach(function (row) {
    if (row.wasteScore >= 45) {
      negativeCandidates.push(row);
    }

    if (row.scaleScore >= 45) {
      scaleCandidates.push(row);
    }

    if (row.watchScore >= 20 || (row.wasteScore < 45 && row.scaleScore < 45 && row.opportunityScore >= 20)) {
      watchlist.push(row);
    }
  });

  negativeCandidates.sort(sortByScore('wasteScore'));
  scaleCandidates.sort(sortByScore('scaleScore'));
  watchlist.sort(sortByScore('watchScore'));

  return {
    rawData: rows,
    negativeCandidates: negativeCandidates,
    scaleCandidates: scaleCandidates,
    watchlist: watchlist
  };
}

function writeSpreadsheet(report, baselines) {
  var spreadsheet = SpreadsheetApp.create(
    'Google Ads Search Term Optimizer - ' + Utilities.formatDate(new Date(), AdsApp.currentAccount().getTimeZone(), 'yyyy-MM-dd HH:mm')
  );

  writeSummarySheet(spreadsheet, report, baselines);
  writeDataSheet(spreadsheet, 'Negative Candidates', report.negativeCandidates);
  writeDataSheet(spreadsheet, 'Scale Candidates', report.scaleCandidates);
  writeDataSheet(spreadsheet, 'Watchlist', report.watchlist);
  writeDataSheet(spreadsheet, 'Raw Data', report.rawData);

  return spreadsheet;
}

function writeSummarySheet(spreadsheet, report, baselines) {
  var sheet = spreadsheet.getActiveSheet();
  sheet.setName('Summary');

  var rows = [
    ['Project', 'Google Ads Search Term Optimizer'],
    ['Source', CONFIG.accountLabel],
    ['Lookback Days', CONFIG.lookbackDays],
    ['Scanned Search Terms', baselines.rowCount],
    ['Total Cost', baselines.cost],
    ['Total Conversions', baselines.conversions],
    ['Account CTR (%)', round(baselines.ctr * 100)],
    ['Account CVR (%)', round(baselines.cvr * 100)],
    ['Account CPA', round(baselines.cpa)],
    ['Negative Candidates', report.negativeCandidates.length],
    ['Scale Candidates', report.scaleCandidates.length],
    ['Watchlist', report.watchlist.length]
  ];

  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
  sheet.autoResizeColumns(1, 2);
}

function writeDataSheet(spreadsheet, sheetName, rows) {
  var headers = [
    'Campaign',
    'Ad Group',
    'Search Term',
    'Status',
    'Impressions',
    'Clicks',
    'Cost',
    'Conversions',
    'Conversion Value',
    'CTR (%)',
    'CVR (%)',
    'CPA',
    'Avg CPC',
    'Waste Score',
    'Scale Score',
    'Watch Score',
    'Opportunity Score',
    'Reasons'
  ];

  var sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');

  if (!rows.length) {
    sheet.getRange(2, 1).setValue('No rows');
    sheet.autoResizeColumns(1, headers.length);
    return;
  }

  var values = rows.map(function (row) {
    return [
      row.campaignName,
      row.adGroupName,
      row.searchTerm,
      row.status,
      row.impressions,
      row.clicks,
      row.cost,
      row.conversions,
      row.conversionValue,
      row.ctr,
      row.cvr,
      row.cpa,
      row.averageCpc,
      row.wasteScore,
      row.scaleScore,
      row.watchScore,
      row.opportunityScore,
      row.reasons
    ];
  });

  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

function sendSummaryEmail(report, baselines, spreadsheetUrl) {
  var subject = 'Google Ads Optimization Signals | ' + CONFIG.accountLabel;
  var body = [
    'Open-source technology by 搜易营销 (Ads.gz.cn)',
    '',
    'Scanned search terms: ' + baselines.rowCount,
    'Negative candidates: ' + report.negativeCandidates.length,
    'Scale candidates: ' + report.scaleCandidates.length,
    'Watchlist: ' + report.watchlist.length,
    '',
    'Spreadsheet:',
    spreadsheetUrl
  ].join('\n');

  MailApp.sendEmail(CONFIG.emailRecipients.join(','), subject, body);
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function microsToCurrency(value) {
  return toNumber(value) / 1000000;
}

function percentageToNumber(value) {
  var numeric = toNumber(value);
  return numeric > 1 ? numeric / 100 : numeric;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  return Number(value);
}

function round(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function sortByScore(field) {
  return function (a, b) {
    return b[field] - a[field];
  };
}
