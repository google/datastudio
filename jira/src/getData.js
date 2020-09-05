/**
 * Constructs an object with values as rows.
 * @param {Fields} requestedFields The requested fields.
 * @param {object[]} response The response.
 * @param {object} request object.
 * @return {object} An object containing rows with values.
 */
function responseToRows(requestedFields, response) {
  const timeZone = Session.getScriptTimeZone();
  const format = 'yyyyMMddHH';
  var resource = getResource().pop();
  // Transform parsed data and filter for requested fields
  return response.map(function(issue) {
    var row = [];
    requestedFields.asArray().forEach(function(field) {
      var fieldId = field.getId();
      var fieldType = field.getType();
      switch (fieldId) {
        case 'id':
          return row.push(issue.id);
        case 'url':
          return row.push(resource.url + '/browse/' + issue.key);
        case 'issuekey':
          return row.push(issue.key);
        case 'statusCategory':
          return row.push(issue.fields.status.statusCategory.name);
        default:
          var field = issue.fields[fieldId];
          var result = '';
          if (field) {
            if (field.constructor === ''.constructor) {
              // Process strings here
              if (fieldType == 'YEAR_MONTH_DAY_HOUR') {
                result = Utilities.formatDate(
                  new Date(field),
                  timeZone,
                  format
                );
              } else {
                result = field;
              }
            } else if (field.constructor === (0).constructor) {
              // Process numbers here
              result = field;
            } else if (field.constructor === [].constructor) {
              // Process arrays here
              result = field.join();
            } else if (field.constructor === {}.constructor) {
              // Process object here
              result =
                field.displayName ||
                field.value ||
                field.name ||
                JSON.stringify(field);
            }
          }
          return row.push(result);
      }
    });
    return {values: row};
  });
}
/**
 * Returns JQL string from configuration.
 * @param {object} request Datastudio request object
 * @returns JQL string.
 */
function getJQL(request) {
  switch (request.configParams.mode) {
    case 'jql': {
      return request.configParams.jql
        .replace(/startDate/g, request.dateRange.startDate)
        .replace(/endDate/g, request.dateRange.endDate);
    }
    case 'filters': {
      return request.configParams.userFilters;
    }
  }
}
/**
 * Returns dimension filters from datastudio as JQL
 * @param {object} dimensionsFilters array containing filtesr from Datastudio
 * @returns {string} filter composed as JQL
 */
function getFilterAsJQL(dimensionsFilters) {
  var operators = {
    EQUALS: {
      INCLUDE: 'FIELD = VALUE',
      EXCLUDE: 'FIELD != VALUE'
    },
    CONTAINS: {
      INCLUDE: 'FIELD ~ VALUE',
      EXCLUDE: 'FIELD !~ VALUE'
    },
    REGEXP_PARTIAL_MATCH: null, // Not supported
    REGEXP_EXACT_MATCH: null, // Not supported
    IN_LIST: {
      INCLUDE: 'FIELD in (VALUE)',
      EXCLUDE: 'FIELD not in (VALUE)'
    },
    IS_NULL: {
      INCLUDE: 'FIELD is null',
      EXCLUDE: 'FIELD is not null'
    },
    BETWEEN: {
      INCLUDE: 'FIELD >= VALUE AND FIELD <= VALUE',
      EXCLUDE: '!(FIELD >= VALUE AND FIELD <= VALUE)'
    },
    NUMERIC_GREATER_THAN: {
      INCLUDE: 'FIELD > VALUE',
      EXCLUDE: '!(FIELD > VALUE)'
    },
    NUMERIC_GREATER_THAN_OR_EQUAL: {
      INCLUDE: 'FIELD >= VALUE',
      EXCLUDE: '!(FIELD >= VALUE)'
    },
    NUMERIC_LESS_THAN: {
      INCLUDE: 'FIELD < VALUE',
      EXCLUDE: '!(FIELD < VALUE)'
    },
    NUMERIC_LESS_THAN_OR_EQUAL: {
      INCLUDE: 'FIELD <= VALUE',
      EXCLUDE: '!(FIELD <= VALUE)'
    }
  };
  var filterAsJQL = dimensionsFilters
    .map(function(ands) {
      return ands
        .map(function(ors) {
          switch (ors.operator) {
            case 'IN_LIST':
              return operators[ors.operator][ors.type]
                .replace(/FIELD/g, parseCustomField(ors.fieldName))
                .replace(
                  'VALUE',
                  ors.values
                    .map(function(value) {
                      return '"' + value + '"';
                    })
                    .join()
                );
            default:
              return operators[ors.operator]
                ? operators[ors.operator][ors.type]
                    .replace(/FIELD/g, parseCustomField(ors.fieldName))
                    .replace('VALUE', ors.values.shift())
                    .replace('VALUE', ors.values.shift())
                : DataStudioApp.createCommunityConnector()
                    .newUserError()
                    .setDebugText('Unsupported operator: ' + ors.operator)
                    .setText(
                      'Filter operator ' +
                        ors.operator +
                        ' not supported at the moment.'
                    )
                    .throwException();
          }
        })
        .join(' or ');
    })
    .join(' and ');
  return filterAsJQL;
}
/**
 * Parse custom fields to match JQL
 * @param {String} string to be parsed
 */
function parseCustomField(string) {
  var customFieldId = 'customfield_';
  return string.indexOf(customFieldId) === 0
    ? 'cf[' + string.replace(customFieldId, '') + ']'
    : string;
}

/**
 * Determine if filters are applied based on dimensionsFilters
 * @param {object} dimensionsFilters array containing filtesr from Datastudio
 * @returns {boolean} true if only supporter filters are applied
 */
function isFilterApplied(dimensionsFilters) {
  return dimensionsFilters.some(function(filtersArray) {
    return !filtersArray.some(matchUnsupportedFilter);
  });
}
/**
 * Determine if unsupported filter from the list
 * @param {object} filter object from dimensionsFilters
 * @returns {boolean} true if matches
 */
function matchUnsupportedFilter(filter) {
  var unsupportedFilters = ['REGEXP_PARTIAL_MATCH', 'REGEXP_EXACT_MATCH'];
  return unsupportedFilters.indexOf(filter.operator) > -1;
}

/**
 * Gets the data for the community connector
 * @param {object} request The request.
 * @return {object} The data.
 */
function getData(request) {
  var requestedFieldIds = request.fields
    .filter(function(field) {
      return !field.forFilterOnly;
    })
    .map(function(field) {
      return field.name;
    });
  var fieldsData = getFromJira('/rest/api/3/field');
  var requestedFields = getFields(fieldsData).forIds(requestedFieldIds);
  var filtersApplied = request.dimensionsFilters
    ? isFilterApplied(request.dimensionsFilters)
    : false;
  var jql = filtersApplied
    ? getJQL(request) + ' and ' + getFilterAsJQL(request.dimensionsFilters)
    : getJQL(request);
  var response = null;
  var startAt = 0;
  var total = null;
  var issues = [];
  try {
    do {
      // Fetch and parse data from API
      response = getFromJira('/rest/api/3/search', {
        maxResults: 100,
        startAt: startAt,
        fields: '*all',
        jql: jql
      });
      issues = issues.concat(response.issues);
      total = response.total;
      startAt += response.maxResults;
    } while (startAt <= total);
  } catch (e) {
    DataStudioApp.createCommunityConnector()
      .newUserError()
      .setDebugText('Error fetching data from API. Exception details: ' + e)
      .setText(
        'There was an error communicating with the service. Try again later, or file an issue if this error persists.'
      )
      .throwException();
  }
  var rows = responseToRows(requestedFields, issues);
  return {
    schema: requestedFields.build(),
    rows: rows,
    filtersApplied: filtersApplied
  };
}

/**
 * Gets request params to call jira api using UrlFetchApp
 * @returns {object} Object containing request params
 */
function getParams() {
  var jiraService = getJiraService();
  var headers = {
    Authorization: 'Bearer ' + jiraService.getAccessToken()
  };
  var params = {
    contentType: 'application/json',
    headers: headers, // Authentication sent as a header
    method: 'get',
    validateHttpsCertificates: false,
    followRedirects: true,
    muteHttpExceptions: false,
    escaping: true
  };
  return params;
}

/**
 * @returns {object} response object containing resources.
 */
function getResource() {
  try {
    var url = 'https://api.atlassian.com/oauth/token/accessible-resources';
    var params = getParams();
    var response = UrlFetchApp.fetch(url, params);
    return JSON.parse(response);
  } catch (error) {
    handleError(error, 'Something went wrong while fetching resources.');
  }
}
/**
 * Get data from Jira REST API
 * @param {string} endpoint Jira REST API endpoint
 * @param {object} params Object containing query parameters
 * @returns {object} Data returned by endpoint
 */
function getFromJira(endpoint, params) {
  try {
    var host = 'https://api.atlassian.com/ex/jira/';
    var resource = getResource().pop();
    var queryParams = [];

    if (endpoint.substr(0, 1) != '/') {
      throw 'Endpoint must start with /';
    }

    if (params) {
      for (var key in params) {
        queryParams.push(key + '=' + params[key]);
      }
    }
    var url = [host, resource.id, endpoint, '?', queryParams.join('&')].join(
      ''
    );

    var response = UrlFetchApp.fetch(encodeURI(url), getParams());
    return JSON.parse(response);
  } catch (error) {
    handleError(error, 'Something went wrong while fetching ' + endpoint);
  }
}
/**
 * Handles error creating Data studio error
 * @param {Object} error thrown
 * @param {String} message for user
 */
function handleError(error, message) {
  DataStudioApp.createCommunityConnector()
    .newUserError()
    .setDebugText(error)
    .setText(message)
    .throwException();
}
